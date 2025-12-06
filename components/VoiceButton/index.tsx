"use client";

import { useRef, useEffect } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioOutlined, LoadingOutlined } from '@ant-design/icons';
import styles from './style.module.css';

interface VoiceButtonProps {
  onRecordComplete: (blob: Blob) => void;
  isProcessing?: boolean;
}

// 把任意音频 Blob 转换为 WAV 格式 (腾讯云 ASR 支持)
async function convertToWav(blob: Blob): Promise<Blob> {
  const audioContext = new AudioContext({ sampleRate: 16000 }); // 16kHz for ASR
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // 转为单声道 16kHz WAV
  const wavBuffer = audioBufferToWav(audioBuffer);
  await audioContext.close();
  
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

// AudioBuffer 转 WAV 格式
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1; // 单声道
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const data = buffer.getChannelData(0);
  const dataLength = data.length * (bitDepth / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;
  
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return arrayBuffer;
}

// 简单的音频可视化
function AudioStreamVisualizer({ stream, width = 120, height = 30, color = '#667eea' }: { stream: MediaStream, width?: number, height?: number, color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barCount = Math.floor(width / 4); // Dynamic bar count based on width
      const barWidth = 2;
      const gap = 2;
      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i] / 255;
        const barHeight = Math.max(2, value * canvas.height);
        ctx.fillStyle = color;
        ctx.fillRect(i * (barWidth + gap), (canvas.height - barHeight) / 2, barWidth, barHeight);
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
      source.disconnect();
      audioContext.close();
    };
  }, [stream, width, color]);

  return <canvas ref={canvasRef} width={width} height={height} />;
}

export function VoiceButton({ onRecordComplete, isProcessing = false }: VoiceButtonProps) {
  const { status, startRecording, stopRecording, previewAudioStream } = 
    useReactMediaRecorder({ 
      audio: true,
      askPermissionOnMount: true,
      onStop: async (_blobUrl, blob) => {
        // 统一转为 WAV 格式，兼容所有浏览器
        const wavBlob = await convertToWav(blob);
        onRecordComplete(wavBlob);
      }
    });

  const isRecording = status === 'recording';

  const handleToggle = () => {
    if (isProcessing) return;

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className={styles.container}>
      {/* 主按钮 - 弹性交互 */}
      <motion.button
        className={`${styles.button} ${isRecording ? styles.active : ''}`}
        onClick={handleToggle}
        initial={false}
        animate={{ 
          width: isRecording ? 160 : 64,
          borderRadius: 32 // 始终保持 32px 圆角
        }}
        disabled={isProcessing}
        layout
      >
        <AnimatePresence mode='wait'>
          {isProcessing ? (
            <motion.span
              key="loading"
              initial={{ scale: 0, rotate: 90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: -90 }}
            >
              <LoadingOutlined spin />
            </motion.span>
          ) : isRecording ? (
            <motion.div
              key="visualizer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.visualizerContainer}
            >
              {previewAudioStream && (
                <AudioStreamVisualizer 
                  stream={previewAudioStream} 
                  width={120} 
                  height={24} 
                  color="#ffffff" 
                />
              )}
            </motion.div>
          ) : (
            <motion.span
              key="mic"
              initial={{ scale: 0, rotate: 90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: -90 }}
            >
              <AudioOutlined />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
