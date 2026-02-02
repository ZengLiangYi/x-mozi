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
import { useLipsyncPlayer, PreparedLipsyncData } from '@/hooks/useLipsyncPlayer';

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 语音交互 Hook
 * 处理完整的语音交互流程：ASR -> Chat -> TTS（句子级分段） -> Lip-sync 播放
 */
export function useVoiceInteraction() {
  const { addMessage, updateMessageContent, updateMessageStatus } = useChatStore();
  const { setAction, lipsyncEnabled, faceFileId, setLipsyncMode } = useAvatarStore();
  const { language } = useLanguageStore();
  const { isProcessing, setIsProcessing, setPhase, reset } = useWakeStore();
  
  // TTS 队列操作
  const { addTask, clearQueue: clearTTSQueue, reset: resetTTSQueue } = useTTSQueueStore();
  
  // Lip-sync 播放器（支持并行预生成 + 顺序播放）
  const { prepare: prepareLipsync, playPrepared, stop: stopLipsync, isPlaying: isLipsyncPlaying } = useLipsyncPlayer();
  
  // Lip-sync 并发控制
  const MAX_CONCURRENT_PREPARE = 2;  // 最大同时进行的预生成任务数
  const activePrepareCountRef = useRef(0);  // 当前正在进行的预生成任务数
  const pendingAudioQueueRef = useRef<Uint8Array[]>([]);  // 等待预生成的音频队列
  
  // Lip-sync 预生成队列（存储 Promise，可以并行预生成）
  const lipsyncPrepareQueueRef = useRef<Array<Promise<PreparedLipsyncData>>>([]);
  // 播放循环是否在运行
  const isLipsyncLoopRunningRef = useRef(false);
  
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
      
      // 清理 Lip-sync
      lipsyncPrepareQueueRef.current = [];
      pendingAudioQueueRef.current = [];
      activePrepareCountRef.current = 0;
      isLipsyncLoopRunningRef.current = false;
      stopLipsync();
    };
  }, [clearTTSQueue, stopLipsync]);

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

  // Lip-sync 等待队列完成
  const waitForLipsyncDrain = useCallback(() => {
    if (!isLipsyncLoopRunningRef.current && lipsyncPrepareQueueRef.current.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      drainResolvers.current.push(resolve);
    });
  }, []);

  /**
   * Lip-sync 播放循环
   * 按顺序等待预生成完成并播放
   */
  const runLipsyncPlayLoop = useCallback(async () => {
    if (isLipsyncLoopRunningRef.current) return;
    isLipsyncLoopRunningRef.current = true;
    
    console.log('🎬 Lip-sync 播放循环开始');
    
    while (lipsyncPrepareQueueRef.current.length > 0) {
      // 取出队首的 Promise
      const preparePromise = lipsyncPrepareQueueRef.current.shift()!;
      
      try {
        // 等待预生成完成
        console.log('⏳ 等待预生成完成...');
        setLipsyncMode('buffering');
        const preparedData = await preparePromise;
        
        // 检查是否被打断
        if (wasInterruptedRef.current) {
          console.log('播放循环被打断');
          break;
        }
        
        // 播放（playPrepared 会在首帧渲染后自动设置 lipsyncMode='playing'）
        console.log('▶️ 播放对口型');
        
        await playPrepared(preparedData, {
          onPlayStart: () => {
            // 在 Canvas 显示后（首帧已渲染）再切换状态，避免闪烁
            setPhase('speaking');
            setAction('talk');
          },
          onPlayEnd: () => {
            console.log('✅ 一句播放完成');
          },
          onError: (error) => {
            console.error('Lip-sync 播放错误:', error);
          },
        });
        
      } catch (error) {
        // AbortError 或已打断的情况，静默退出
        if (wasInterruptedRef.current || 
            (error instanceof Error && error.name === 'AbortError') ||
            (error instanceof DOMException && error.name === 'AbortError')) {
          console.log('Lip-sync 预生成被取消');
          break;
        }
        console.error('Lip-sync 处理错误:', error);
      }
    }
    
    // 循环结束
    isLipsyncLoopRunningRef.current = false;
    
    // 如果不是被打断的，恢复到 idle 状态
    if (!wasInterruptedRef.current) {
      setAction('idle');
      setPhase('idle');
      setLipsyncMode('idle');
    }
    
    // 通知等待者
    drainResolvers.current.forEach((fn) => fn());
    drainResolvers.current = [];
    
    console.log('🎬 Lip-sync 播放循环结束');
  }, [playPrepared, setAction, setPhase, setLipsyncMode]);

  /**
   * 启动一个预生成任务（内部函数）
   */
  const startPrepareTask = useCallback((audioBytes: Uint8Array) => {
    if (!faceFileId) return;
    
    activePrepareCountRef.current++;
    console.log(`📤 开始预生成 lip-sync 帧 (并发: ${activePrepareCountRef.current}/${MAX_CONCURRENT_PREPARE})`);
    
    const preparePromise = prepareLipsync(
      faceFileId, 
      audioBytes, 
      abortControllerRef.current?.signal
    ).finally(() => {
      // 任务完成（成功或失败），减少计数
      activePrepareCountRef.current--;
      
      // 检查等待队列，启动下一个任务
      if (pendingAudioQueueRef.current.length > 0 && activePrepareCountRef.current < MAX_CONCURRENT_PREPARE) {
        const nextAudio = pendingAudioQueueRef.current.shift()!;
        startPrepareTask(nextAudio);
      }
    });
    
    // 加入预生成队列
    lipsyncPrepareQueueRef.current.push(preparePromise);
    
    // 启动播放循环（如果尚未运行）
    runLipsyncPlayLoop().catch(err => {
      if (err?.name !== 'AbortError') {
        console.error('Lip-sync 播放循环错误:', err);
      }
    });
  }, [faceFileId, prepareLipsync, runLipsyncPlayLoop]);

  // 处理音频的回调（判断是否启用 lip-sync）
  const handleAudio = useCallback((audioBytes: Uint8Array) => {
    if (lipsyncEnabled && faceFileId) {
      // 检查是否达到最大并发数
      if (activePrepareCountRef.current < MAX_CONCURRENT_PREPARE) {
        // 未达到上限，立即启动预生成
        startPrepareTask(audioBytes);
      } else {
        // 达到上限，加入等待队列
        console.log(`⏸️ 预生成任务已满 (${MAX_CONCURRENT_PREPARE})，加入等待队列`);
        pendingAudioQueueRef.current.push(audioBytes);
      }
    } else {
      // 降级：使用原有音频播放
      enqueueAudio(audioBytes);
    }
  }, [lipsyncEnabled, faceFileId, enqueueAudio, startPrepareTask]);

  // TTS 执行器
  const { 
    startProcessing: startTTSProcessing, 
    stopAndClear: stopTTSProcessing,
    waitForAllComplete: waitForTTSComplete,
  } = useTTSExecutor({
    maxConcurrent: 2,
    onAudio: handleAudio,
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
    
    // 3. 清空 Lip-sync 预生成队列并停止当前播放
    lipsyncPrepareQueueRef.current = [];
    pendingAudioQueueRef.current = [];
    activePrepareCountRef.current = 0;
    isLipsyncLoopRunningRef.current = false;
    stopLipsync();
    
    // 4. 停止当前正在播放的音频（降级模式）
    if (currentAudioRef.current) {
      currentAudioRef.current.audio.pause();
      URL.revokeObjectURL(currentAudioRef.current.url);
      currentAudioRef.current = null;
    }
    
    // 5. 清空音频播放队列
    for (const item of audioQueueRef.current) {
      item.audio.pause();
      URL.revokeObjectURL(item.url);
    }
    audioQueueRef.current = [];
    playingRef.current = false;
    
    // 6. 清空句子缓冲区
    sentenceBufferRef.current = '';
    
    // 7. 重置状态（使用单一 action 保证原子性）
    setAction('idle');
    setLipsyncMode('idle');
    reset(); // 同时重置 isProcessing 和 phase
    
    // 8. 清理 drain resolvers
    drainResolvers.current.forEach((fn) => fn());
    drainResolvers.current = [];
  }, [setAction, setLipsyncMode, reset, stopTTSProcessing, stopLipsync]);

  // 处理文本输入（流式语音识别后直接调用）
  const handleTextInput = useCallback(async (userText: string) => {
    if (isProcessing || !userText.trim()) return;
    
    // 重置打断标记和句子缓冲区
    wasInterruptedRef.current = false;
    sentenceBufferRef.current = '';
    
    // 重置 TTS 队列和 Lip-sync 队列
    resetTTSQueue();
    lipsyncPrepareQueueRef.current = [];
    pendingAudioQueueRef.current = [];
    activePrepareCountRef.current = 0;
    isLipsyncLoopRunningRef.current = false;
    
    setIsProcessing(true);
    setPhase('thinking'); // 开始思考
    setAction('think');   // 进入思考状态，播放 think.mp4
    const msgId = generateId();
    const botMsgId = generateId();
    
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // 标记是否已开始说话（对于 lip-sync 模式，此标记不再用于切换 phase）
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
            
            // 第一个句子入队时，切换到 speaking 阶段（仅降级模式）
            // lip-sync 模式下，phase 由播放器在帧就绪时切换
            if (!hasSentFirstSentence && !lipsyncEnabled) {
              hasSentFirstSentence = true;
              setPhase('speaking');
              console.log('🔊 开始句子级流式语音合成（降级模式）...');
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
        
        // 对于降级模式（非 lip-sync），在这里切换 phase
        if (!hasSentFirstSentence && !lipsyncEnabled) {
          hasSentFirstSentence = true;
          setPhase('speaking');
        }
      }
      sentenceBufferRef.current = '';

      // 等待所有 TTS 任务完成
      await waitForTTSComplete();
      
      // 等待播放完成（根据是否启用 lip-sync 选择等待哪个队列）
      if (lipsyncEnabled && faceFileId) {
        await waitForLipsyncDrain();
      } else {
        await waitForDrain();
        setPhase('idle'); // 降级模式下在这里重置 phase
        setAction('idle');
      }
      // lip-sync 模式下，phase 和 action 由 playNextLipsyncRef 在队列播放完成时重置

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
    waitForLipsyncDrain,
    language,
    addTask,
    resetTTSQueue,
    startTTSProcessing,
    waitForTTSComplete,
    lipsyncEnabled,
    faceFileId,
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
