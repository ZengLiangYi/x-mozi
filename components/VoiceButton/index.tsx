"use client";

import { forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioOutlined, LoadingOutlined } from '@ant-design/icons';
import { useRealtimeASR } from '@/hooks/useRealtimeASR';
import { AudioVisualizer } from './AudioVisualizer';
import styles from './style.module.css';

interface VoiceButtonProps {
  /** 识别完成回调（VAD 静音后自动触发） */
  onResult: (text: string) => void;
  /** 是否正在处理（AI 回复中） */
  isProcessing?: boolean;
  /** 识别过程中的回调（实时显示） */
  onInterim?: (text: string) => void;
}

/** 暴露给父组件的方法 */
export interface VoiceButtonRef {
  startRecording: () => void;
  stopRecording: () => void;
  isRecording: boolean;
}

export const VoiceButton = forwardRef<VoiceButtonRef, VoiceButtonProps>(
  function VoiceButton({ onResult, isProcessing = false, onInterim }, ref) {
    const { isRecording, mediaStream, startRecording, stopRecording } = useRealtimeASR({
      onResult,
      onInterim,
      silenceTimeout: 1500,
    });

    // 暴露方法给父组件（用于唤醒模式自动触发）
    useImperativeHandle(ref, () => ({
      startRecording: () => {
        if (!isProcessing && !isRecording) {
          startRecording();
        }
      },
      stopRecording,
      isRecording,
    }), [isProcessing, isRecording, startRecording, stopRecording]);

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
        {/* 主按钮 - 录音时变宽 */}
        <motion.button
          className={`${styles.button} ${isRecording ? styles.active : ''}`}
          onClick={handleToggle}
          initial={false}
          animate={{
            width: isRecording ? 160 : 64, // 录音时变宽以容纳波形
            borderRadius: 32, // 保持圆角
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
              /* 录音状态：显示音频波形 */
              <motion.div
                key="visualizer"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className={styles.visualizerWrapper}
              >
                {mediaStream && (
                  <AudioVisualizer
                    stream={mediaStream}
                    width={100}
                    height={30}
                    barWidth={3}
                    gap={2}
                    barColor="#ffffff" // 波形颜色为白色
                  />
                )}
              </motion.div>
            ) : (
              /* 默认状态：显示麦克风图标 */
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
);
