"use client";

import { useCallback, useEffect, useRef } from 'react';
import { streamTextToSpeech } from '@/services/tts';
import { useTTSQueueStore, TTSTask } from '@/store/ttsQueueStore';
import { cleanMarkdown, forceSplitText } from '@/utils/sentenceExtractor';

/** TTS 单段最大字符数（与后端保持一致） */
const MAX_TTS_CHARS = 150;

export interface UseTTSExecutorOptions {
  /** 最大并发数，默认 2 */
  maxConcurrent?: number;
  /** 音频数据回调（用于播放） */
  onAudio: (bytes: Uint8Array) => void;
  /** AbortSignal 用于取消所有请求 */
  signal?: AbortSignal;
}

export interface TTSExecutorResult {
  /** 开始执行队列中的任务 */
  startProcessing: () => void;
  /** 停止处理并清空队列 */
  stopAndClear: () => void;
  /** 等待所有任务完成 */
  waitForAllComplete: () => Promise<void>;
  /** 是否还有任务在处理 */
  isProcessing: boolean;
}

/**
 * TTS 并发执行器 Hook
 * 负责从队列取任务并发执行 TTS，同时保证音频按顺序播放
 */
export function useTTSExecutor(options: UseTTSExecutorOptions): TTSExecutorResult {
  const { maxConcurrent = 2, onAudio, signal } = options;

  const {
    tasks,
    processingCount,
    isAllCompleted,
    getNextPendingTask,
    getNextPlayableTask,
    updateTaskStatus,
    markAsPlayed,
    clearQueue,
  } = useTTSQueueStore();

  // 当前正在处理的任务 ID 集合
  const processingIdsRef = useRef<Set<string>>(new Set());
  // 是否正在运行
  const isRunningRef = useRef(false);
  // 完成回调队列
  const completeResolversRef = useRef<Array<() => void>>([]);
  // 用于内部取消的 AbortController
  const internalAbortRef = useRef<AbortController | null>(null);

  /**
   * 尝试播放下一个可播放的音频
   */
  const tryPlayNext = useCallback(() => {
    const task = getNextPlayableTask();
    if (task && task.audioData) {
      onAudio(task.audioData);
      markAsPlayed(task.id);
      // 递归检查是否有更多可播放的
      // 使用 setTimeout 避免同步递归
      setTimeout(() => tryPlayNext(), 0);
    }
  }, [getNextPlayableTask, markAsPlayed, onAudio]);

  /**
   * 处理单个 TTS 任务
   */
  const processTask = useCallback(
    async (task: TTSTask, abortSignal: AbortSignal) => {
      const { id, text } = task;

      try {
        // 标记为处理中
        updateTaskStatus(id, 'processing');
        processingIdsRef.current.add(id);

        // 清理 Markdown
        const cleanedText = cleanMarkdown(text);
        if (!cleanedText.trim()) {
          // 空文本，直接标记完成（无音频）
          updateTaskStatus(id, 'error', undefined, '文本为空');
          return;
        }

        // 如果文本过长，需要内部分段处理
        const chunks = cleanedText.length > MAX_TTS_CHARS
          ? forceSplitText(cleanedText, MAX_TTS_CHARS)
          : [cleanedText];

        // 收集所有音频片段
        const audioParts: Uint8Array[] = [];

        for (const chunk of chunks) {
          if (abortSignal.aborted) {
            throw new Error('已取消');
          }

          await streamTextToSpeech(chunk, {
            onAudio: (bytes) => {
              audioParts.push(bytes);
            },
            signal: abortSignal,
          });
        }

        // 合并所有音频片段
        const totalLength = audioParts.reduce((sum, part) => sum + part.length, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const part of audioParts) {
          merged.set(part, offset);
          offset += part.length;
        }

        // 更新状态为完成
        updateTaskStatus(id, 'completed', merged);

        // 尝试播放
        tryPlayNext();
      } catch (error) {
        // 检查是否是取消
        if (abortSignal.aborted) {
          console.log(`TTS 任务 ${id} 已取消`);
          return;
        }

        const errorMessage = error instanceof Error ? error.message : 'TTS 失败';
        console.error(`TTS 任务 ${id} 失败:`, errorMessage);
        updateTaskStatus(id, 'error', undefined, errorMessage);

        // 即使失败也要尝试播放后续（如果有的话）
        // 更新 nextPlayOrder 跳过此任务
        markAsPlayed(id);
        tryPlayNext();
      } finally {
        processingIdsRef.current.delete(id);
      }
    },
    [updateTaskStatus, markAsPlayed, tryPlayNext]
  );

  /**
   * 检查是否全部完成
   */
  const checkAllComplete = useCallback(() => {
    const state = useTTSQueueStore.getState();
    if (state.isAllCompleted && processingIdsRef.current.size === 0) {
      // 通知所有等待者
      completeResolversRef.current.forEach((resolve) => resolve());
      completeResolversRef.current = [];
    }
  }, []);

  /**
   * 尝试启动新任务
   */
  const tryStartTasks = useCallback(() => {
    if (!isRunningRef.current) return;
    if (!internalAbortRef.current) return;

    const abortSignal = internalAbortRef.current.signal;
    if (abortSignal.aborted) return;

    // 检查是否可以启动更多任务
    while (processingIdsRef.current.size < maxConcurrent) {
      const task = getNextPendingTask();
      if (!task) break;

      // 立即标记为 processing 避免重复获取
      updateTaskStatus(task.id, 'processing');
      
      // 启动任务（不等待）
      processTask(task, abortSignal).then(() => {
        // 任务完成后，尝试启动新任务
        tryStartTasks();
        // 检查是否全部完成
        checkAllComplete();
      });
    }
  }, [maxConcurrent, getNextPendingTask, updateTaskStatus, processTask, checkAllComplete]);

  /**
   * 开始处理队列
   */
  const startProcessing = useCallback(() => {
    if (isRunningRef.current) return;

    isRunningRef.current = true;
    internalAbortRef.current = new AbortController();

    // 如果有外部 signal，监听它
    if (signal) {
      signal.addEventListener('abort', () => {
        internalAbortRef.current?.abort();
      });
    }

    tryStartTasks();
  }, [signal, tryStartTasks]);

  /**
   * 停止处理并清空队列
   */
  const stopAndClear = useCallback(() => {
    isRunningRef.current = false;

    // 取消所有进行中的请求
    if (internalAbortRef.current) {
      internalAbortRef.current.abort();
      internalAbortRef.current = null;
    }

    // 清空处理中的 ID
    processingIdsRef.current.clear();

    // 清空队列
    clearQueue();

    // 通知所有等待者
    completeResolversRef.current.forEach((resolve) => resolve());
    completeResolversRef.current = [];
  }, [clearQueue]);

  /**
   * 等待所有任务完成
   */
  const waitForAllComplete = useCallback(() => {
    const state = useTTSQueueStore.getState();

    // 如果已经全部完成
    if (
      state.tasks.length === 0 ||
      (state.isAllCompleted && processingIdsRef.current.size === 0)
    ) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      completeResolversRef.current.push(resolve);
    });
  }, []);

  // 监听队列变化，自动启动任务
  useEffect(() => {
    if (isRunningRef.current && tasks.some((t) => t.status === 'pending')) {
      tryStartTasks();
    }
  }, [tasks, tryStartTasks]);

  // 监听 isAllCompleted 变化
  useEffect(() => {
    if (isAllCompleted) {
      checkAllComplete();
    }
  }, [isAllCompleted, checkAllComplete]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopAndClear();
    };
  }, [stopAndClear]);

  return {
    startProcessing,
    stopAndClear,
    waitForAllComplete,
    isProcessing: processingCount > 0 || processingIdsRef.current.size > 0,
  };
}
