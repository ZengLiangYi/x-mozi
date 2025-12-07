"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { speechToText } from '@/services/asr';
import { chatStream } from '@/services/chat';
import { textToSpeech } from '@/services/tts';
import { useChatStore } from '@/store/chatStore';
import { useAvatarStore } from '@/store/avatarStore';

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
  
  // 音频播放引用
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // 组件卸载时清理音频资源
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  // 清理当前播放的音频
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // 播放音频
  const playAudio = useCallback(async (audioBuffer: ArrayBuffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      cleanupAudio();

      const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onplay = () => {
        setAction('talk');
      };
      
      audio.onended = () => {
        setAction('idle');
        cleanupAudio();
        resolve();
      };
      
      audio.onerror = (e) => {
        console.error('音频播放错误:', e);
        setAction('idle');
        cleanupAudio();
        reject(new Error('音频播放失败'));
      };

      audio.play().catch(reject);
    });
  }, [setAction, cleanupAudio]);

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
      
      await chatStream(userText, (chunk) => {
        fullBotResponse += chunk;
        updateMessageContent(botMsgId, fullBotResponse);
      });
      
      updateMessageStatus(botMsgId, 'success');
      console.log('🤖 AI 回复:', fullBotResponse);
      
      if (!fullBotResponse) {
        throw new Error('AI 回复为空');
      }

      // TTS: 文字转语音
      console.log('🔊 生成语音...');
      const audioBuffer = await textToSpeech(fullBotResponse);
      
      // 播放音频
      await playAudio(audioBuffer);

    } catch (error) {
      console.error('语音交互错误:', error);
      setAction('idle');
      updateMessageStatus(botMsgId, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage, updateMessageContent, updateMessageStatus, setAction, isProcessing, playAudio]);

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
