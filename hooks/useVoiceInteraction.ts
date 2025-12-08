"use client";

import { useCallback, useRef, useEffect } from 'react';
import { speechToText } from '@/services/asr';
import { chatStream } from '@/services/chat';
import { useChatStore } from '@/store/chatStore';
import { useAvatarStore } from '@/store/avatarStore';
import { useLanguageStore } from '@/store/languageStore';
import { useWakeStore } from '@/store/wakeStore';
import { useTTSQueueStore } from '@/store/ttsQueueStore';
import { extractSentences, processRemainingText } from '@/utils/sentenceExtractor';
import { useTTSExecutor } from '@/hooks/useTTSExecutor';

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 语音交互 Hook
 * 处理完整的语音交互流程：ASR -> Chat -> TTS（句子级分段） -> 播放
 */
export function useVoiceInteraction() {
  const { addMessage, updateMessageContent, updateMessageStatus } = useChatStore();
  const { setAction } = useAvatarStore();
  const { language } = useLanguageStore();
  const { isProcessing, setIsProcessing, setPhase, reset } = useWakeStore();
  
  // TTS 队列操作
  const { addTask, clearQueue: clearTTSQueue, reset: resetTTSQueue } = useTTSQueueStore();
  
  const audioQueueRef = useRef<Array<{ audio: HTMLAudioElement; url: string }>>([]);
  const playingRef = useRef(false);
  const drainResolvers = useRef<Array<() => void>>([]);
  
  // 追踪当前正在播放的音频（已从队列移出）
  const currentAudioRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  
  // 用于取消正在进行的请求
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // 标记是否被打断（避免 finally 重复重置状态）
  const wasInterruptedRef = useRef(false);
  
  // 句子缓冲区（用于流式 Chat 时提取完整句子）
  const sentenceBufferRef = useRef('');

  // 组件卸载时清理音频资源
  useEffect(() => {
    return () => {
      // 取消进行中的请求
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      
      // 停止当前正在播放的音频
      if (currentAudioRef.current) {
        currentAudioRef.current.audio.pause();
        URL.revokeObjectURL(currentAudioRef.current.url);
        currentAudioRef.current = null;
      }
      
      // 清理队列
      for (const item of audioQueueRef.current) {
        item.audio.pause();
        URL.revokeObjectURL(item.url);
      }
      audioQueueRef.current = [];
      playingRef.current = false;
      
      // 清理 TTS 队列
      clearTTSQueue();
    };
  }, [clearTTSQueue]);

  const resolveDrain = useCallback(() => {
    if (audioQueueRef.current.length === 0 && !playingRef.current) {
      drainResolvers.current.forEach((fn) => fn());
      drainResolvers.current = [];
    }
  }, []);

  const playNextRef = useRef<() => void>(() => {});
  useEffect(() => {
    playNextRef.current = () => {
      if (playingRef.current) return;
      const next = audioQueueRef.current.shift();
      if (!next) {
        currentAudioRef.current = null;
        setAction('idle');
        resolveDrain();
        return;
      }

      playingRef.current = true;
      currentAudioRef.current = next; // 追踪当前播放的音频
      const { audio, url } = next;

      audio.onplay = () => setAction('talk');
      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        playingRef.current = false;
        playNextRef.current();
      };
      audio.onerror = (e) => {
        console.error('音频播放错误:', e);
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        playingRef.current = false;
        playNextRef.current();
      };

      audio.play().catch((err) => {
        console.error('音频播放失败:', err);
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        playingRef.current = false;
        playNextRef.current();
      });
    };
  }, [resolveDrain, setAction]);

  const enqueueAudio = useCallback(
    (bytes: Uint8Array) => {
      // Copy into a fresh Uint8Array to avoid SharedArrayBuffer typing issues
      const safeBytes = new Uint8Array(bytes);
      const blob = new Blob([safeBytes], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioQueueRef.current.push({ audio, url });
      playNextRef.current();
    },
    []
  );

  const waitForDrain = useCallback(() => {
    if (!playingRef.current && audioQueueRef.current.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      drainResolvers.current.push(resolve);
    });
  }, []);

  // TTS 执行器
  const { 
    startProcessing: startTTSProcessing, 
    stopAndClear: stopTTSProcessing,
    waitForAllComplete: waitForTTSComplete,
  } = useTTSExecutor({
    maxConcurrent: 2,
    onAudio: enqueueAudio,
    signal: abortControllerRef.current?.signal,
  });

  /**
   * 打断当前回复
   * 停止音频播放、取消流式请求、重置状态
   */
  const interrupt = useCallback(() => {
    console.log('🛑 用户打断回复');
    
    // 标记已被打断
    wasInterruptedRef.current = true;
    
    // 1. 取消进行中的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 2. 停止 TTS 处理并清空队列
    stopTTSProcessing();
    
    // 3. 停止当前正在播放的音频
    if (currentAudioRef.current) {
      currentAudioRef.current.audio.pause();
      URL.revokeObjectURL(currentAudioRef.current.url);
      currentAudioRef.current = null;
    }
    
    // 4. 清空音频播放队列
    for (const item of audioQueueRef.current) {
      item.audio.pause();
      URL.revokeObjectURL(item.url);
    }
    audioQueueRef.current = [];
    playingRef.current = false;
    
    // 5. 清空句子缓冲区
    sentenceBufferRef.current = '';
    
    // 6. 重置状态（使用单一 action 保证原子性）
    setAction('idle');
    reset(); // 同时重置 isProcessing 和 phase
    
    // 7. 清理 drain resolvers
    drainResolvers.current.forEach((fn) => fn());
    drainResolvers.current = [];
  }, [setAction, reset, stopTTSProcessing]);

  // 处理文本输入（流式语音识别后直接调用）
  const handleTextInput = useCallback(async (userText: string) => {
    if (isProcessing || !userText.trim()) return;
    
    // 重置打断标记和句子缓冲区
    wasInterruptedRef.current = false;
    sentenceBufferRef.current = '';
    
    // 重置 TTS 队列
    resetTTSQueue();
    
    setIsProcessing(true);
    setPhase('thinking'); // 开始思考
    const msgId = generateId();
    const botMsgId = generateId();
    
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // 标记是否已开始说话
    let hasSentFirstSentence = false;

    try {
      console.log('📝 处理用户输入:', userText);

      // 添加用户消息
      addMessage({
        id: msgId,
        role: 'user',
        content: userText,
        status: 'success',
        timestamp: Date.now(),
      });

      // 添加 AI 占位消息
      addMessage({
        id: botMsgId,
        role: 'ai',
        content: '',
        status: 'loading',
        timestamp: Date.now(),
      });

      // 启动 TTS 执行器（准备接收任务）
      startTTSProcessing();

      // Chat: 发送给 AI（流式响应）
      let fullBotResponse = '';
      console.log('🤖 发送给 AI...');
      
      await chatStream(
        userText,
        (chunk) => {
          fullBotResponse += chunk;
          sentenceBufferRef.current += chunk;
          updateMessageContent(botMsgId, fullBotResponse);
          
          // 实时提取完整句子
          const { completeSentences, remaining } = extractSentences(sentenceBufferRef.current);
          sentenceBufferRef.current = remaining;
          
          // 立即将完整句子加入 TTS 队列
          for (const sentence of completeSentences) {
            console.log('📤 句子入队:', sentence);
            addTask(sentence);
            
            // 第一个句子入队时，切换到 speaking 阶段
            if (!hasSentFirstSentence) {
              hasSentFirstSentence = true;
              setPhase('speaking');
              console.log('🔊 开始句子级流式语音合成...');
            }
          }
        },
        {
          language,
          systemPrompt: 'Please respond in English.',
          signal,
        }
      );
      
      updateMessageStatus(botMsgId, 'success');
      console.log('🤖 AI 回复完成:', fullBotResponse);
      
      if (!fullBotResponse) {
        throw new Error('AI 回复为空');
      }

      // 处理剩余的不完整句子
      const remainingChunks = processRemainingText(sentenceBufferRef.current);
      for (const chunk of remainingChunks) {
        console.log('📤 剩余文本入队:', chunk);
        addTask(chunk);
        
        if (!hasSentFirstSentence) {
          hasSentFirstSentence = true;
          setPhase('speaking');
        }
      }
      sentenceBufferRef.current = '';

      // 等待所有 TTS 任务完成
      await waitForTTSComplete();
      
      // 等待所有音频播放完成
      await waitForDrain();
      setPhase('idle'); // 说完了

    } catch (error) {
      // 如果是用户打断导致的取消，不视为错误
      if (signal.aborted || wasInterruptedRef.current) {
        console.log('🛑 请求已被用户打断');
        // 如果有部分响应，标记为成功（已显示的内容）
        const currentContent = useChatStore.getState().messages.find(m => m.id === botMsgId)?.content;
        if (currentContent) {
          updateMessageStatus(botMsgId, 'success');
        }
        // 状态已在 interrupt() 中重置，直接返回
        return;
      }
      
      console.error('语音交互错误:', error);
      setAction('idle');
      setPhase('idle');
      updateMessageStatus(botMsgId, 'error');
    } finally {
      // 清理 controller 引用
      if (abortControllerRef.current?.signal === signal) {
        abortControllerRef.current = null;
      }
      // 只有非打断情况才在 finally 中重置状态（打断时已在 interrupt() 中重置）
      if (!wasInterruptedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [
    addMessage,
    updateMessageContent,
    updateMessageStatus,
    setAction,
    setPhase,
    setIsProcessing,
    isProcessing,
    waitForDrain,
    language,
    addTask,
    resetTTSQueue,
    startTTSProcessing,
    waitForTTSComplete,
  ]);

  // 处理语音输入（录音后调用，需要先 ASR）
  const handleVoiceInput = useCallback(async (audioBlob: Blob) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    const botMsgId = generateId();

    try {
      // ASR: 语音转文字
      console.log('🎤 语音识别中...');
      const userText = await speechToText(audioBlob);
      console.log('🎤 识别结果:', userText);

      if (!userText.trim()) {
        setIsProcessing(false);
        return;
      }

      // 重置处理状态，让 handleTextInput 接管
      setIsProcessing(false);
      await handleTextInput(userText);

    } catch (error) {
      console.error('语音识别错误:', error);
      setAction('idle');
      setIsProcessing(false);
      updateMessageStatus(botMsgId, 'error');
    }
  }, [handleTextInput, setAction, updateMessageStatus, isProcessing, setIsProcessing]);

  return {
    isProcessing,
    handleVoiceInput,
    handleTextInput,
    interrupt,
  };
}
