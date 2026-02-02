"use client";

import { useCallback, useRef, useEffect } from 'react';
import { 
  uploadAudio, 
  generateFrames, 
  LipsyncInfoEvent, 
  LipsyncFrameEvent,
  LipsyncCompleteEvent,
} from '@/services/lipsync';
import { useAvatarStore } from '@/store/avatarStore';

/** 预生成的数据 */
export interface PreparedLipsyncData {
  frames: string[];           // base64 帧数据
  bitmaps?: ImageBitmap[];    // 预解码的帧（可选，播放时生成）
  audioBytes: Uint8Array;     // 原始音频
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
}

/** 播放回调 */
export interface LipsyncPlayerCallbacks {
  onPlayStart?: () => void;
  onPlayEnd?: () => void;
  onError?: (error: Error) => void;
}

/** 播放器返回值 */
export interface LipsyncPlayerResult {
  /** 预生成帧（可以并行调用多个） */
  prepare: (faceFileId: string, audioBytes: Uint8Array, signal?: AbortSignal) => Promise<PreparedLipsyncData>;
  /** 播放预生成的数据 */
  playPrepared: (data: PreparedLipsyncData, callbacks?: LipsyncPlayerCallbacks) => Promise<void>;
  /** 停止当前播放 */
  stop: () => void;
  /** 是否正在播放 */
  isPlaying: () => boolean;
}

/** 获取 lip-sync canvas 元素 */
function getLipsyncCanvas(): HTMLCanvasElement | null {
  return document.getElementById('lipsync-canvas') as HTMLCanvasElement | null;
}

/**
 * Lip-sync 播放器 Hook
 * 支持并行预生成 + 顺序播放
 */
export function useLipsyncPlayer(): LipsyncPlayerResult {
  const { setLipsyncMode } = useAvatarStore();
  
  // Canvas context ref
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  // 播放状态
  const isPlayingRef = useRef(false);
  const currentFrameRef = useRef(0);
  
  // 音频相关
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioStartTimeRef = useRef<number>(0);
  
  // 渲染相关
  const animationFrameIdRef = useRef<number | null>(null);
  const currentDataRef = useRef<PreparedLipsyncData | null>(null);
  const bitmapsRef = useRef<ImageBitmap[]>([]);
  
  // 播放完成回调
  const onPlayEndRef = useRef<(() => void) | null>(null);
  
  /**
   * 绘制 ImageBitmap 到 Canvas（同步，无闪烁）
   */
  const drawBitmap = useCallback((bitmap: ImageBitmap) => {
    const ctx = ctxRef.current;
    const canvas = getLipsyncCanvas();
    if (!ctx || !canvas) return;
    
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, []);
  
  /**
   * 将 base64 帧数据转换为 ImageBitmap
   */
  const decodeFrameToBitmap = useCallback(async (base64Data: string): Promise<ImageBitmap> => {
    const response = await fetch('data:image/jpeg;base64,' + base64Data);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }, []);
  
  /**
   * 预解码所有帧为 ImageBitmap
   */
  const decodeAllFrames = useCallback(async (frames: string[]): Promise<ImageBitmap[]> => {
    console.log(`预解码 ${frames.length} 帧...`);
    const bitmaps: ImageBitmap[] = [];
    
    // 分批解码，避免内存峰值过高
    const batchSize = 10;
    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);
      const batchBitmaps = await Promise.all(
        batch.map(frame => frame ? decodeFrameToBitmap(frame) : Promise.resolve(null as unknown as ImageBitmap))
      );
      bitmaps.push(...batchBitmaps);
    }
    
    console.log(`帧解码完成`);
    return bitmaps;
  }, [decodeFrameToBitmap]);
  
  /**
   * 渲染帧循环
   */
  const renderFrame = useCallback(() => {
    if (!isPlayingRef.current || !currentDataRef.current) return;
    
    const audioContext = audioContextRef.current;
    const data = currentDataRef.current;
    const bitmaps = bitmapsRef.current;
    if (!audioContext) return;
    
    // 计算当前应该显示的帧
    const audioElapsed = audioContext.currentTime - audioStartTimeRef.current;
    const targetFrame = Math.floor(audioElapsed * data.fps);
    
    // 绘制帧（使用预解码的 ImageBitmap，同步绘制无闪烁）
    if (targetFrame < bitmaps.length && bitmaps[targetFrame]) {
      if (currentFrameRef.current !== targetFrame) {
        drawBitmap(bitmaps[targetFrame]);
        currentFrameRef.current = targetFrame;
      }
    }
    
    // 继续循环或结束
    if (targetFrame < data.totalFrames) {
      animationFrameIdRef.current = requestAnimationFrame(renderFrame);
    } else {
      // 播放完成
      isPlayingRef.current = false;
      setLipsyncMode('idle');
      onPlayEndRef.current?.();
      onPlayEndRef.current = null;
    }
  }, [drawBitmap, setLipsyncMode]);
  
  /**
   * 停止当前播放
   */
  const stop = useCallback(() => {
    // 停止渲染循环
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    
    // 停止音频
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) { /* ignore */ }
      audioSourceRef.current = null;
    }
    
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) { /* ignore */ }
      audioContextRef.current = null;
    }
    
    // 清理 ImageBitmap 资源
    for (const bitmap of bitmapsRef.current) {
      if (bitmap) {
        bitmap.close();
      }
    }
    bitmapsRef.current = [];
    
    // 清理状态
    audioBufferRef.current = null;
    currentDataRef.current = null;
    isPlayingRef.current = false;
    currentFrameRef.current = 0;
    
    setLipsyncMode('idle');
  }, [setLipsyncMode]);
  
  /**
   * 预生成帧（可以并行调用多个）
   * 这个函数不会影响当前播放状态
   */
  const prepare = useCallback(async (
    faceFileId: string,
    audioBytes: Uint8Array,
    signal?: AbortSignal
  ): Promise<PreparedLipsyncData> => {
    console.log('开始预生成帧...');
    
    // 上传音频
    const audioFileId = await uploadAudio(audioBytes);
    
    if (signal?.aborted) {
      const abortError = new DOMException('已取消', 'AbortError');
      throw abortError;
    }
    
    // 准备结果
    const result: PreparedLipsyncData = {
      frames: [],
      audioBytes,
      totalFrames: 0,
      fps: 25,
      width: 0,
      height: 0,
    };
    
    // 生成帧
    await new Promise<void>((resolve, reject) => {
      generateFrames(
        faceFileId,
        audioFileId,
        {
          batchSize: 16,
          outputFps: 25,
          jpegQuality: 95,
          resizeFactor: 0.5,
          signal,
        },
        {
          onInfo: (event: LipsyncInfoEvent) => {
            result.totalFrames = event.total_frames;
            result.fps = event.fps;
            result.width = event.width;
            result.height = event.height;
            result.frames = new Array(event.total_frames);
          },
          
          onFrame: (event: LipsyncFrameEvent) => {
            result.frames[event.index] = event.data;
          },
          
          onComplete: (event: LipsyncCompleteEvent) => {
            console.log(`预生成完成: ${event.total_frames} 帧, ${event.total_time.toFixed(2)}秒`);
            resolve();
          },
          
          onError: (event) => {
            reject(new Error(event.message));
          },
        }
      ).catch(reject);
    });
    
    return result;
  }, []);
  
  /**
   * 播放预生成的数据
   */
  const playPrepared = useCallback(async (
    data: PreparedLipsyncData,
    callbacks: LipsyncPlayerCallbacks = {}
  ): Promise<void> => {
    // 停止之前的播放
    stop();
    
    return new Promise(async (resolve, reject) => {
      try {
        // 保存数据和回调
        currentDataRef.current = data;
        onPlayEndRef.current = () => {
          callbacks.onPlayEnd?.();
          resolve();
        };
        
        // 设置 Canvas 尺寸
        const canvas = getLipsyncCanvas();
        if (canvas) {
          canvas.width = data.width;
          canvas.height = data.height;
          ctxRef.current = canvas.getContext('2d');
        }
        
        // 预解码所有帧为 ImageBitmap（在后台线程进行，不阻塞主线程）
        bitmapsRef.current = await decodeAllFrames(data.frames);
        
        // 预渲染首帧到 Canvas（在切换显示之前）
        if (bitmapsRef.current.length > 0 && bitmapsRef.current[0]) {
          drawBitmap(bitmapsRef.current[0]);
          console.log('首帧已预渲染');
        }
        
        // 创建 AudioContext 并解码音频
        audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        
        const arrayBuffer = new ArrayBuffer(data.audioBytes.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(data.audioBytes);
        
        audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // 开始播放
        isPlayingRef.current = true;
        currentFrameRef.current = 0;
        
        // 播放音频
        audioSourceRef.current = audioContextRef.current.createBufferSource();
        audioSourceRef.current.buffer = audioBufferRef.current;
        audioSourceRef.current.connect(audioContextRef.current.destination);
        audioSourceRef.current.start(0);
        audioStartTimeRef.current = audioContextRef.current.currentTime;
        
        console.log('开始播放对口型');
        // 此时 Canvas 上已经有首帧内容，切换显示不会闪烁
        setLipsyncMode('playing');
        callbacks.onPlayStart?.();
        
        // 开始帧渲染循环
        renderFrame();
        
      } catch (error) {
        console.error('播放失败:', error);
        stop();
        callbacks.onError?.(error instanceof Error ? error : new Error('播放失败'));
        reject(error);
      }
    });
  }, [stop, setLipsyncMode, renderFrame, decodeAllFrames, drawBitmap]);
  
  /**
   * 检查是否正在播放
   */
  const isPlaying = useCallback(() => {
    return isPlayingRef.current;
  }, []);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);
  
  return {
    prepare,
    playPrepared,
    stop,
    isPlaying,
  };
}
