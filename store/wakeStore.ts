import { create } from 'zustand';

/** 处理阶段 */
export type ProcessingPhase = 'idle' | 'thinking' | 'speaking';

interface WakeState {
  /** 是否正在录音 */
  isRecording: boolean;
  /** 是否正在处理（AI 思考或播放中） */
  isProcessing: boolean;
  /** 当前处理阶段 */
  phase: ProcessingPhase;

  // Actions
  setIsRecording: (isRecording: boolean) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setPhase: (phase: ProcessingPhase) => void;
  /** 重置所有状态到空闲（用于打断场景） */
  reset: () => void;
}

export const useWakeStore = create<WakeState>((set) => ({
  isRecording: false,
  isProcessing: false,
  phase: 'idle',

  setIsRecording: (isRecording) => set({ isRecording }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setPhase: (phase) => set({ phase }),
  reset: () => set({ isProcessing: false, phase: 'idle' }),
}));

/**
 * 计算是否应该禁用唤醒
 * 当正在录音或 AI 正在处理时禁用
 */
export const selectShouldDisableWake = () => {
  const { isRecording, isProcessing } = useWakeStore.getState();
  return isProcessing || isRecording;
};
