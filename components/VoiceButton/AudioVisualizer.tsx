"use client";

import { useEffect, useRef } from 'react';
import { createAudioContext } from '@/utils/audio';

interface AudioVisualizerProps {
  /** MediaStream 音频流 */
  stream: MediaStream | null;
  /** 宽度 */
  width?: number;
  /** 高度 */
  height?: number;
  /** 柱状条宽度 */
  barWidth?: number;
  /** 柱状条间距 */
  gap?: number;
  /** 柱状条颜色 */
  barColor?: string;
}

/** FFT 大小 */
const FFT_SIZE = 256;
/** 平滑系数 */
const SMOOTHING_TIME_CONSTANT = 0.8;
/** 最小柱状条高度 */
const MIN_BAR_HEIGHT = 2;

/**
 * 自定义音频可视化组件
 * 使用 Web Audio API 的 AnalyserNode 实现实时波形显示
 */
export function AudioVisualizer({
  stream,
  width = 120,
  height = 30,
  barWidth = 2,
  gap = 2,
  barColor = '#667eea',
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 创建 AudioContext 和 AnalyserNode
    const audioContext = createAudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
    analyserRef.current = analyser;

    // 连接音频流到分析器
    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // 计算柱状条数量
    const barCount = Math.floor(width / (barWidth + gap));

    // 绘制函数
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // 清除画布
      ctx.clearRect(0, 0, width, height);

      // 绘制柱状条
      for (let i = 0; i < barCount; i++) {
        // 从频率数据中采样
        const dataIndex = Math.floor(i * bufferLength / barCount);
        const value = dataArray[dataIndex];
        
        // 计算柱状条高度（最小高度保证可见）
        const barHeight = Math.max(MIN_BAR_HEIGHT, (value / 255) * height);
        
        // 计算位置（居中显示）
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // 绘制圆角矩形
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }
    };

    draw();

    // 清理函数
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stream, width, height, barWidth, gap, barColor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  );
}
