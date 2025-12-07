"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { createAudioContext, audiaToPcmBuffer } from '@/utils/audio';
import { TencentAsrResponse, ASR_SLICE_TYPE } from '@/types/asr';
import {
  WAKE_WORD_COOLDOWN_MS,
  MAX_ACCUMULATED_TEXT_LENGTH,
  TRIM_TEXT_TO_LENGTH,
  WS_RECONNECT_DELAY,
  DEFAULT_WAKE_WORDS,
  AUDIO_PROCESSOR_PATH,
  AUDIO_PROCESSOR_NAME,
  MICROPHONE_CONSTRAINTS,
} from '@/constants/audio';

export interface UseWakeWordOptions {
  /** 唤醒词列表 */
  wakeWords?: string[];
  /** 检测到唤醒词的回调 */
  onWakeUp?: () => void;
}

export interface UseWakeWordReturn {
  /** 是否正在监听 */
  isListening: boolean;
  /** 错误信息 */
  error: string | null;
  /** 开始监听 */
  startListening: () => Promise<void>;
  /** 停止监听 */
  stopListening: () => void;
}

/**
 * 语音唤醒 Hook - 持续监听唤醒词
 * 
 * 通过控制台启用：
 * window.startWakeWord()  // 开始监听
 * window.stopWakeWord()   // 停止监听
 */
export function useWakeWord(options: UseWakeWordOptions = {}): UseWakeWordReturn {
  const {
    wakeWords = DEFAULT_WAKE_WORDS,
    onWakeUp,
  } = options;

  // State
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs - 资源引用
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Refs - 状态引用
  const accumulatedTextRef = useRef('');
  const lastWakeUpTimeRef = useRef(0);
  const isManualStopRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Refs - 回调引用
  const onWakeUpRef = useRef(onWakeUp);
  
  useEffect(() => {
    onWakeUpRef.current = onWakeUp;
  }, [onWakeUp]);

  // 去除标点符号（用于唤醒词匹配）
  const removePunctuation = useCallback((text: string): string => {
    return text
      .toLowerCase()
      .replace(/[，。！？、；：""''【】《》（）…—～·,.!?;:'"()\[\]{}<>@#$%^&*+=|\\/_-]/g, '')
      .replace(/\s+/g, '');
  }, []);

  // 检查唤醒词
  const checkWakeWord = useCallback((text: string): boolean => {
    const normalizedText = removePunctuation(text);
    return wakeWords.some(word => normalizedText.includes(removePunctuation(word)));
  }, [wakeWords, removePunctuation]);

  // 清理所有资源
  const cleanup = useCallback(() => {
    // 清理重连定时器
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 断开 AudioWorklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // 断开音频源
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // 关闭 AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // 停止 MediaStream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // 关闭 WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      isManualStopRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  // 初始化音频处理
  const initAudioProcessing = useCallback(async (
    ws: WebSocket,
    stream: MediaStream
  ) => {
    const audioContext = createAudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    try {
      await audioContext.audioWorklet.addModule(AUDIO_PROCESSOR_PATH);
    } catch (e) {
      console.error('加载 AudioWorklet 模块失败:', e);
      throw new Error('音频处理模块加载失败');
    }

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    const workletNode = new AudioWorkletNode(audioContext, AUDIO_PROCESSOR_NAME);
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const inputData: Float32Array = event.data;
      const pcmBuffer = audiaToPcmBuffer(inputData, audioContext.sampleRate);
      ws.send(pcmBuffer);
    };

    source.connect(workletNode);
    workletNode.connect(audioContext.destination);
  }, []);

  // 处理 WebSocket 消息
  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const response: TencentAsrResponse = JSON.parse(event.data);
      
      if (response.code !== 0 || !response.result) return;

      const text = response.result.voice_text_str;
      const isFinal = response.result.slice_type === ASR_SLICE_TYPE.END;

      // 累积最终结果
      if (isFinal) {
        accumulatedTextRef.current += text;
      }

      // 检查唤醒词
      const textToCheck = isFinal 
        ? accumulatedTextRef.current 
        : accumulatedTextRef.current + text;
      
      const now = Date.now();
      const cooldownElapsed = now - lastWakeUpTimeRef.current > WAKE_WORD_COOLDOWN_MS;

      if (checkWakeWord(textToCheck) && cooldownElapsed) {
        console.log('✅ 检测到唤醒词:', textToCheck);
        lastWakeUpTimeRef.current = now;
        accumulatedTextRef.current = '';
        onWakeUpRef.current?.();
      }

      // 防止累积文本过长
      if (accumulatedTextRef.current.length > MAX_ACCUMULATED_TEXT_LENGTH) {
        accumulatedTextRef.current = accumulatedTextRef.current.slice(-TRIM_TEXT_TO_LENGTH);
      }
    } catch {
      // 忽略解析错误
    }
  }, [checkWakeWord]);

  // 开始监听（声明提前以便 handleWsClose 引用）
  const startListeningRef = useRef<() => Promise<void>>(undefined);

  // 处理 WebSocket 关闭
  const handleWsClose = useCallback(() => {
    setIsListening(false);
    
    // 非手动停止时自动重连
    if (!isManualStopRef.current) {
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!isManualStopRef.current) {
          cleanup();
          startListeningRef.current?.();
        }
      }, WS_RECONNECT_DELAY);
    }
  }, [cleanup]);

  // 开始监听
  const startListening = useCallback(async () => {
    if (isListening) return;

    isManualStopRef.current = false;
    setError(null);
    accumulatedTextRef.current = '';

    try {
      console.log('🎤 开始监听唤醒词...');

      // 获取 WebSocket URL
      const urlResponse = await fetch('/api/asr/realtime');
      if (!urlResponse.ok) {
        throw new Error('获取连接失败');
      }
      const { url: wsUrl } = await urlResponse.json();

      // 获取麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);
      mediaStreamRef.current = stream;

      // 创建 WebSocket 连接
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('🎤 唤醒监听已启动');
        setIsListening(true);

        try {
          await initAudioProcessing(ws, stream);
        } catch (err) {
          setError(err instanceof Error ? err.message : '音频初始化失败');
          cleanup();
        }
      };

      ws.onmessage = handleWsMessage;

      ws.onerror = () => {
        setError('连接错误');
        cleanup();
        setIsListening(false);
      };

      ws.onclose = handleWsClose;

    } catch (err) {
      console.error('启动唤醒监听失败:', err);
      setError(err instanceof Error ? err.message : '启动失败');
      cleanup();
    }
  }, [isListening, cleanup, initAudioProcessing, handleWsMessage, handleWsClose]);

  // 更新 ref
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // 停止监听
  const stopListening = useCallback(() => {
    console.log('🎤 停止唤醒监听');
    isManualStopRef.current = true;
    cleanup();
    setIsListening(false);
    accumulatedTextRef.current = '';
  }, [cleanup]);

  return {
    isListening,
    error,
    startListening,
    stopListening,
  };
}
