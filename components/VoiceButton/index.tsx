"use client";

import { forwardRef, useImperativeHandle, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioOutlined, PauseOutlined } from '@ant-design/icons';
import { useRealtimeASR } from '@/hooks/useRealtimeASR';
import { AudioVisualizer } from './AudioVisualizer';
import styles from './style.module.css';
import { DEFAULT_SILENCE_TIMEOUT } from '@/constants/audio';

/** 打断后的冷却时间（毫秒） */
const INTERRUPT_COOLDOWN = 500;

interface VoiceButtonProps {
  /** 识别完成回调（VAD 静音后自动触发） */
  onResult: (text: string) => void;
  /** 是否正在处理（AI 回复中） */
  isProcessing?: boolean;
  /** 识别过程中的回调（实时显示） */
  onInterim?: (text: string) => void;
  /** 录音状态变化回调 */
  onRecordingChange?: (isRecording: boolean) => void;
  /** 打断回复回调（AI 回复中点击触发） */
  onInterrupt?: () => void;
}

/** 暴露给父组件的方法 */
export interface VoiceButtonRef {
  startRecording: () => void;
  stopRecording: () => void;
  isRecording: boolean;
}

export const VoiceButton = forwardRef<VoiceButtonRef, VoiceButtonProps>(
  function VoiceButton({ onResult, isProcessing = false, onInterim, onRecordingChange, onInterrupt }, ref) {
    const { isRecording, mediaStream, startRecording, stopRecording } = useRealtimeASR({
      onResult,
      onInterim,
      silenceTimeout: DEFAULT_SILENCE_TIMEOUT,
    });
    
    // 打断冷却期标记
    const interruptCooldownRef = useRef(false);

    // 通知父组件录音状态变化
    useEffect(() => {
      onRecordingChange?.(isRecording);
    }, [isRecording, onRecordingChange]);

    // 安全的开始录音（带冷却检查）
    const safeStartRecording = useCallback(() => {
      if (!isProcessing && !isRecording && !interruptCooldownRef.current) {
        startRecording();
      }
    }, [isProcessing, isRecording, startRecording]);

    // 暴露方法给父组件（用于唤醒模式自动触发）
    useImperativeHandle(ref, () => ({
      startRecording: safeStartRecording,
      stopRecording,
      isRecording,
    }), [safeStartRecording, stopRecording, isRecording]);

    const handleToggle = () => {
      // AI 回复中，点击触发打断
      if (isProcessing) {
        // 设置冷却期，防止打断后立即触发录音
        interruptCooldownRef.current = true;
        setTimeout(() => {
          interruptCooldownRef.current = false;
        }, INTERRUPT_COOLDOWN);
        
        onInterrupt?.();
        return;
      }
      
      // 冷却期内不响应
      if (interruptCooldownRef.current) {
        return;
      }

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
          className={`${styles.button} ${isRecording ? styles.active : ''} ${isProcessing ? styles.processing : ''}`}
          onClick={handleToggle}
          initial={false}
          animate={{
            width: isRecording ? 160 : 64, // 录音时变宽以容纳波形
            borderRadius: 32, // 保持圆角
          }}
          layout
        >
          <AnimatePresence mode='wait'>
            {isProcessing ? (
              /* 处理中状态：显示暂停图标，可点击打断 */
              <motion.span
                key="processing"
                initial={{ scale: 0, rotate: 90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: -90 }}
                className={styles.interruptIcon}
              >
                <PauseOutlined />
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
