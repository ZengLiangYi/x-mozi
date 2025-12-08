"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { createAudioContext, audiaToPcmBuffer } from '@/utils/audio';
import { TencentAsrResponse, ASR_SLICE_TYPE } from '@/types/asr';
import {
  DEFAULT_SILENCE_TIMEOUT,
  AUDIO_PROCESSOR_PATH,
  AUDIO_PROCESSOR_NAME,
  MICROPHONE_CONSTRAINTS,
} from '@/constants/audio';

export interface UseRealtimeASROptions {
  /** 识别完成回调（VAD 检测到静音后触发） */
  onResult?: (text: string) => void;
  /** 识别过程中的回调（实时显示） */
  onInterim?: (text: string) => void;
  /** 静音超时时间（毫秒） */
  silenceTimeout?: number;
}

export interface UseRealtimeASRReturn {
  /** 是否正在录音 */
  isRecording: boolean;
  /** 当前识别到的文本 */
  transcript: string;
  /** 错误信息 */
  error: string | null;
  /** MediaStream 音频流（用于音频可视化） */
  mediaStream: MediaStream | null;
  /** 开始录音 */
  startRecording: () => Promise<void>;
  /** 停止录音 */
  stopRecording: () => void;
}

/**
 * 实时语音识别 Hook - 基于腾讯云实时 ASR
 * 
 * 功能：
 * - 点击开始录音
 * - 实时显示识别结果
 * - VAD 检测到静音后自动停止并返回结果
 * - 提供 MediaStream 用于音频可视化
 */
export function useRealtimeASR(options: UseRealtimeASROptions = {}): UseRealtimeASRReturn {
  const {
    onResult,
    onInterim,
    silenceTimeout = DEFAULT_SILENCE_TIMEOUT,
  } = options;

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Refs - 资源引用
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Refs - 状态引用
  const accumulatedTextRef = useRef('');  // 已确认的累积文本（final 结果）
  const currentSentenceRef = useRef('');  // 当前句子的临时文本（interim 结果，会被替换）
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppedRef = useRef(false);
  
  // Refs - 回调引用（避免闭包问题）
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);
  
  useEffect(() => {
    onResultRef.current = onResult;
    onInterimRef.current = onInterim;
  }, [onResult, onInterim]);

  // 清理静音超时
  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  // 清理所有资源
  const cleanup = useCallback(() => {
    clearSilenceTimeout();

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
    setMediaStream(null);

    // 关闭 WebSocket
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      
      if (ws.readyState === WebSocket.OPEN) {
        // 连接已打开，发送结束信号后关闭
        ws.send(JSON.stringify({ type: 'end' }));
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        // 连接中，清空所有回调防止影响新的录音状态，然后在连接成功后关闭
        ws.onopen = () => ws.close();
        ws.onclose = () => {};  // 忽略关闭事件，防止影响新录音的 isRecording 状态
        ws.onmessage = () => {}; // 忽略消息
        ws.onerror = () => {}; // 忽略连接错误
      } else if (ws.readyState === WebSocket.CLOSING) {
        // 正在关闭，无需操作
      } else {
        // 已关闭，无需操作
      }
    }
  }, [clearSilenceTimeout]);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // 完成录音并发送结果
  const finishRecording = useCallback(() => {
    // 合并已累积文本和当前句子
    const text = (accumulatedTextRef.current + currentSentenceRef.current).trim();
    console.log('🎤 录音完成:', text);
    
    cleanup();
    setIsRecording(false);
    
    if (text) {
      onResultRef.current?.(text);
    }
    
    accumulatedTextRef.current = '';
    currentSentenceRef.current = '';
    setTranscript('');
  }, [cleanup]);

  // 处理 WebSocket 消息
  const handleWsMessage = useCallback((event: MessageEvent) => {
    if (isStoppedRef.current) return;
    
    try {
      const response: TencentAsrResponse = JSON.parse(event.data);
      
      if (response.code !== 0) {
        console.error('ASR 错误:', response.message);
        return;
      }

      if (response.result) {
        const text = response.result.voice_text_str;
        const isFinal = response.result.slice_type === ASR_SLICE_TYPE.END;
        
        clearSilenceTimeout();
        
        if (isFinal) {
          // VAD 检测到静音，当前句子确认完成，累积到总文本
          accumulatedTextRef.current += text;
          currentSentenceRef.current = '';  // 清空当前句子
          setTranscript(accumulatedTextRef.current);
          onInterimRef.current?.(accumulatedTextRef.current);
          
          // 设置静音超时，等待可能的后续语音
          silenceTimeoutRef.current = setTimeout(() => {
            if (!isStoppedRef.current) {
              finishRecording();
            }
          }, silenceTimeout);
        } else {
          // 临时结果：替换当前句子（不累加），显示 = 已累积 + 当前句子
          currentSentenceRef.current = text;
          const displayText = accumulatedTextRef.current + text;
          setTranscript(displayText);
          onInterimRef.current?.(displayText);
        }
      }
    } catch {
      console.error('解析 ASR 响应失败');
    }
  }, [clearSilenceTimeout, finishRecording, silenceTimeout]);

  // 初始化音频处理
  const initAudioProcessing = useCallback(async (
    ws: WebSocket,
    stream: MediaStream
  ) => {
    const audioContext = createAudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    
    // 加载 AudioWorklet 模块
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

    // 处理音频数据
    workletNode.port.onmessage = (event) => {
      if (ws.readyState !== WebSocket.OPEN || isStoppedRef.current) return;
      const inputData: Float32Array = event.data;
      const pcmBuffer = audiaToPcmBuffer(inputData, audioContext.sampleRate);
      ws.send(pcmBuffer);
    };

    source.connect(workletNode);
    workletNode.connect(audioContext.destination);
  }, []);

  // 开始录音
  const startRecording = useCallback(async () => {
    if (isRecording) return;

    isStoppedRef.current = false;
    setError(null);
    accumulatedTextRef.current = '';
    currentSentenceRef.current = '';
    setTranscript('');

    try {
      console.log('🎙️ 开始实时语音识别...');

      // 1. 获取 WebSocket URL
      const urlResponse = await fetch('/api/asr/realtime');
      if (!urlResponse.ok) {
        throw new Error('获取语音识别连接失败');
      }
      const { url: wsUrl } = await urlResponse.json();

      // 2. 获取麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);
      mediaStreamRef.current = stream;
      setMediaStream(stream);

      // 3. 创建 WebSocket 连接
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('🎤 ASR 连接成功');
        setIsRecording(true);

        try {
          await initAudioProcessing(ws, stream);
        } catch (err) {
          setError(err instanceof Error ? err.message : '音频初始化失败');
          cleanup();
        }
      };

      ws.onmessage = handleWsMessage;

      ws.onerror = () => {
        setError('语音识别连接错误');
        cleanup();
        setIsRecording(false);
      };

      ws.onclose = () => {
        if (!isStoppedRef.current) {
          // 连接意外关闭，返回已累积的结果（包括当前句子）
          const text = (accumulatedTextRef.current + currentSentenceRef.current).trim();
          if (text) {
            onResultRef.current?.(text);
          }
        }
        setIsRecording(false);
      };

    } catch (err) {
      console.error('启动录音失败:', err);
      setError(err instanceof Error ? err.message : '启动失败');
      cleanup();
    }
  }, [isRecording, cleanup, initAudioProcessing, handleWsMessage]);

  // 停止录音
  const stopRecording = useCallback(() => {
    isStoppedRef.current = true;
    clearSilenceTimeout();
    
    // 合并已累积文本和当前句子的临时结果
    const text = (accumulatedTextRef.current + currentSentenceRef.current).trim() || transcript.trim();
    cleanup();
    setIsRecording(false);
    
    // 如果有文本，发送结果
    if (text) {
      onResultRef.current?.(text);
    }
    
    accumulatedTextRef.current = '';
    currentSentenceRef.current = '';
    setTranscript('');
  }, [cleanup, clearSilenceTimeout, transcript]);

  return {
    isRecording,
    transcript,
    error,
    mediaStream,
    startRecording,
    stopRecording,
  };
}
