"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { speechToText } from '@/services/asr';
import { chatStream } from '@/services/chat';
import { streamTextToSpeech } from '@/services/tts';
import { useChatStore } from '@/store/chatStore';
import { useAvatarStore } from '@/store/avatarStore';
import { useLanguageStore } from '@/store/languageStore';

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 语音交互 Hook
 * 处理完整的语音交互流程：ASR -> Chat -> TTS -> 播放
 */
export function useVoiceInteraction() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { addMessage, updateMessageContent, updateMessageStatus } = useChatStore();
  const { setAction } = useAvatarStore();
  const { language } = useLanguageStore();
  
  const audioQueueRef = useRef<Array<{ audio: HTMLAudioElement; url: string }>>([]);
  const playingRef = useRef(false);
  const drainResolvers = useRef<Array<() => void>>([]);

  // 组件卸载时清理音频资源
  useEffect(() => {
    return () => {
      // 清理队列
      for (const item of audioQueueRef.current) {
        item.audio.pause();
        URL.revokeObjectURL(item.url);
      }
      audioQueueRef.current = [];
      playingRef.current = false;
    };
  }, []);

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
        setAction('idle');
        resolveDrain();
        return;
      }

      playingRef.current = true;
      const { audio, url } = next;

      audio.onplay = () => setAction('talk');
      audio.onended = () => {
        URL.revokeObjectURL(url);
        playingRef.current = false;
        playNextRef.current();
      };
      audio.onerror = (e) => {
        console.error('音频播放错误:', e);
        URL.revokeObjectURL(url);
        playingRef.current = false;
        playNextRef.current();
      };

      audio.play().catch((err) => {
        console.error('音频播放失败:', err);
        URL.revokeObjectURL(url);
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

  // 处理文本输入（流式语音识别后直接调用）
  const handleTextInput = useCallback(async (userText: string) => {
    if (isProcessing || !userText.trim()) return;
    
    setIsProcessing(true);
    const msgId = generateId();
    const botMsgId = generateId();

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

      // Chat: 发送给 AI（流式响应）
      let fullBotResponse = '';
      console.log('🤖 发送给 AI...');
      
      await chatStream(
        userText,
        (chunk) => {
          fullBotResponse += chunk;
          updateMessageContent(botMsgId, fullBotResponse);
        },
        {
          language,
          systemPrompt: 'Please respond in English.',
        }
      );
      
      updateMessageStatus(botMsgId, 'success');
      console.log('🤖 AI 回复:', fullBotResponse);
      
      if (!fullBotResponse) {
        throw new Error('AI 回复为空');
      }

      console.log('🔊 流式生成语音...');
      await streamTextToSpeech(fullBotResponse, {
        onAudio: async (bytes) => {
          enqueueAudio(bytes);
        },
      });

      await waitForDrain();

    } catch (error) {
      console.error('语音交互错误:', error);
      setAction('idle');
      updateMessageStatus(botMsgId, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [
    addMessage,
    updateMessageContent,
    updateMessageStatus,
    setAction,
    isProcessing,
    enqueueAudio,
    waitForDrain,
    language,
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
  }, [handleTextInput, setAction, updateMessageStatus, isProcessing]);

  return {
    isProcessing,
    handleVoiceInput,
    handleTextInput,
  };
}
