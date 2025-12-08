"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

/** 检测间隔（毫秒） */
const DETECTION_INTERVAL_MS = 200;
/** 唤醒所需持续检测时间（毫秒） */
const WAKE_DURATION_MS = 2000;
/** 唤醒冷却时间（毫秒） */
const WAKE_COOLDOWN_MS = 5000;
/** MediaPipe WASM 文件 CDN 路径 */
const MEDIAPIPE_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
/** 物体检测模型 CDN 路径 (EfficientDet-Lite0，支持检测人体) */
const OBJECT_DETECTOR_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

export interface UseCameraWakeOptions {
  /** 检测到人持续 2 秒后的回调 */
  onWakeUp?: () => void;
  /** 是否禁用唤醒（AI 正在处理时应设为 true） */
  disabled?: boolean;
}

export interface UseCameraWakeReturn {
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 错误信息 */
  error: string | null;
  /** 摄像头视频流（用于预览） */
  mediaStream: MediaStream | null;
  /** 开始检测 */
  startDetecting: () => Promise<void>;
  /** 停止检测 */
  stopDetecting: () => void;
}

/**
 * 摄像头人脸检测唤醒 Hook
 * 
 * 通过控制台启用：
 * window.startCameraWake()  // 开始检测
 * window.stopCameraWake()   // 停止检测
 */
export function useCameraWake(options: UseCameraWakeOptions = {}): UseCameraWakeReturn {
  const { onWakeUp, disabled = false } = options;

  // State
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Refs - 资源引用
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const objectDetectorRef = useRef<ObjectDetector | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs - 状态引用
  const personDetectedStartRef = useRef<number | null>(null);
  const lastWakeUpTimeRef = useRef<number>(0);
  const isManualStopRef = useRef(false);
  const disabledRef = useRef(disabled);

  // Refs - 回调引用
  const onWakeUpRef = useRef(onWakeUp);

  useEffect(() => {
    onWakeUpRef.current = onWakeUp;
  }, [onWakeUp]);

  // 同步 disabled 状态到 ref
  useEffect(() => {
    disabledRef.current = disabled;
    // 当禁用时，重置人脸检测计时
    if (disabled) {
      personDetectedStartRef.current = null;
    }
  }, [disabled]);

  // 清理所有资源
  const cleanup = useCallback(() => {
    // 清理检测定时器
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    // 停止 MediaStream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setMediaStream(null);

    // 移除 video 元素
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }

    // 关闭 ObjectDetector
    if (objectDetectorRef.current) {
      objectDetectorRef.current.close();
      objectDetectorRef.current = null;
    }

    personDetectedStartRef.current = null;
  }, []);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      isManualStopRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  // 初始化 ObjectDetector（检测人体）
  const initObjectDetector = useCallback(async (): Promise<ObjectDetector> => {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
    const objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: OBJECT_DETECTOR_MODEL_PATH,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      scoreThreshold: 0.5,
      categoryAllowlist: ['person'], // 只检测人
    });
    return objectDetector;
  }, []);

  // 执行人体检测
  const detectPerson = useCallback(() => {
    const video = videoRef.current;
    const objectDetector = objectDetectorRef.current;

    if (!video || !objectDetector || video.readyState < 2) {
      return;
    }

    // 如果禁用状态，跳过检测逻辑
    if (disabledRef.current) {
      return;
    }

    try {
      const now = performance.now();
      const detections = objectDetector.detectForVideo(video, now);
      const hasPerson = detections.detections.length > 0;

      if (hasPerson) {
        // 检测到人
        if (personDetectedStartRef.current === null) {
          personDetectedStartRef.current = Date.now();
          console.log('👤 检测到人，开始计时...');
        } else {
          const duration = Date.now() - personDetectedStartRef.current;
          const cooldownElapsed = Date.now() - lastWakeUpTimeRef.current > WAKE_COOLDOWN_MS;

          if (duration >= WAKE_DURATION_MS && cooldownElapsed) {
            console.log('✅ 持续检测到人 2 秒，触发唤醒！');
            lastWakeUpTimeRef.current = Date.now();
            personDetectedStartRef.current = null;
            onWakeUpRef.current?.();
          }
        }
      } else {
        // 未检测到人，重置计时
        if (personDetectedStartRef.current !== null) {
          console.log('👤 人离开，重置计时');
          personDetectedStartRef.current = null;
        }
      }
    } catch (err) {
      console.error('人体检测错误:', err);
    }
  }, []);

  // 开始检测
  const startDetecting = useCallback(async () => {
    if (isDetecting) return;

    isManualStopRef.current = false;
    setError(null);
    personDetectedStartRef.current = null;

    try {
      console.log('📷 开始摄像头人体检测...');

      // 初始化 ObjectDetector
      console.log('📷 加载人体检测模型...');
      const objectDetector = await initObjectDetector();
      objectDetectorRef.current = objectDetector;
      console.log('📷 人体检测模型加载完成');

      // 获取摄像头权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });
      mediaStreamRef.current = stream;
      setMediaStream(stream);

      // 创建隐藏的 video 元素
      const video = document.createElement('video');
      video.srcObject = stream;
      video.style.position = 'absolute';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      video.playsInline = true;
      video.muted = true;
      document.body.appendChild(video);
      videoRef.current = video;

      // 等待视频加载
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play()
            .then(() => resolve())
            .catch(reject);
        };
        video.onerror = () => reject(new Error('视频加载失败'));
      });

      console.log('📷 摄像头已启动，开始检测人体');
      setIsDetecting(true);

      // 开始定时检测
      detectionIntervalRef.current = setInterval(detectPerson, DETECTION_INTERVAL_MS);

    } catch (err) {
      console.error('启动摄像头检测失败:', err);
      setError(err instanceof Error ? err.message : '启动失败');
      cleanup();
    }
  }, [isDetecting, cleanup, initObjectDetector, detectPerson]);

  // 停止检测
  const stopDetecting = useCallback(() => {
    console.log('📷 停止摄像头检测');
    isManualStopRef.current = true;
    cleanup();
    setIsDetecting(false);
  }, [cleanup]);

  return {
    isDetecting,
    error,
    mediaStream,
    startDetecting,
    stopDetecting,
  };
}
