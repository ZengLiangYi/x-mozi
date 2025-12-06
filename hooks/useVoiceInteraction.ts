"use client";

import { useState, useCallback, useRef } from 'react';
import { speechToText } from '@/services/asr';
import { chatStream } from '@/services/chat';
import { textToSpeech } from '@/services/tts';
import { useChatStore } from '@/store/chatStore';
import { useAvatarStore } from '@/store/avatarStore';

export function useVoiceInteraction() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { addMessage, updateMessageContent, updateMessageStatus } = useChatStore();
  const { setAction } = useAvatarStore();
  
  // 用于播放音频的 Ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleVoiceInput = useCallback(async (audioBlob: Blob) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    const msgId = Date.now().toString();
    const botMsgId = (Date.now() + 1).toString();

    try {
      // 1. ASR: 语音转文字
      console.log('Starting ASR...');
      // 临时添加一个空的 User 消息，表示正在识别? 
      // 或者等待识别结果出来再显示。为了体验，先不显示。
      
      const userText = await speechToText(audioBlob);
      console.log('ASR Result:', userText);

      if (!userText.trim()) {
        setIsProcessing(false);
        return;
      }

      // 添加用户消息
      addMessage({
        id: msgId,
        role: 'user',
        content: userText,
        status: 'success',
        timestamp: Date.now(),
      });

      // 2. Chat: 发送给 AI
      let fullBotResponse = '';
      
      // 添加 AI 占位消息
      addMessage({
        id: botMsgId,
        role: 'ai',
        content: '', // 初始为空
        status: 'loading',
        timestamp: Date.now(),
      });

      console.log('Starting Chat Stream...');
      await chatStream(userText, (chunk) => {
        fullBotResponse += chunk;
        updateMessageContent(botMsgId, fullBotResponse);
      });
      
      // 流式结束，标记状态完成
      updateMessageStatus(botMsgId, 'success');

      console.log('Chat Complete:', fullBotResponse);
      
      if (!fullBotResponse) {
        throw new Error('Empty response from chat');
      }

      // 3. TTS: 文字转语音
      console.log('Starting TTS...');
      const audioBuffer = await textToSpeech(fullBotResponse);
      
      // 4. Play Audio & Avatar Animation
      const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onplay = () => {
        setAction('talk');
      };
      
      audio.onended = () => {
        setAction('idle');
        setIsProcessing(false);
        URL.revokeObjectURL(url);
      };
      
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setAction('idle');
        setIsProcessing(false);
      };

      await audio.play();

    } catch (error) {
      console.error('Voice Interaction Error:', error);
      setAction('idle');
      setIsProcessing(false);
      
      // 如果出错，更新消息状态
      updateMessageStatus(botMsgId, 'error');
    }
  }, [addMessage, updateMessageContent, updateMessageStatus, setAction, isProcessing]);

  return {
    isProcessing,
    handleVoiceInput,
  };
}
