import { create } from 'zustand';
import { AvatarAction, AVATAR_LIST } from '@/types/avatar';

/** Lip-sync 模式 */
export type LipsyncMode = 'idle' | 'buffering' | 'playing';

interface AvatarState {
  currentAvatarId: string;
  action: AvatarAction;
  isPlaying: boolean;
  
  // Lip-sync 相关
  lipsyncEnabled: boolean;        // 是否启用 lip-sync（默认 true）
  lipsyncMode: LipsyncMode;       // 用于控制 Canvas 显示
  faceFileId: string | null;      // 当前 avatar 的人脸文件 ID
  
  // Actions
  setAvatarId: (id: string) => void;
  setAction: (action: AvatarAction) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  
  // Lip-sync Actions
  setLipsyncEnabled: (enabled: boolean) => void;
  setLipsyncMode: (mode: LipsyncMode) => void;
  setFaceFileId: (id: string | null) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  currentAvatarId: AVATAR_LIST[0].id,
  action: 'idle',
  isPlaying: true,
  
  // Lip-sync 默认值
  lipsyncEnabled: true,   // 默认启用实时口型
  lipsyncMode: 'idle',    // idle=不显示Canvas, buffering=缓冲中, playing=播放中
  faceFileId: null,

  setAvatarId: (id) => set({ currentAvatarId: id, faceFileId: null }), // 切换 avatar 时清空 faceFileId
  setAction: (nextAction) =>
    set((state) => {
      // Prevent talk -> dance interruption per state spec
      if (state.action === 'talk' && nextAction === 'dance') {
        return state;
      }
      if (state.action === nextAction) {
        return state;
      }
      return { action: nextAction };
    }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  
  // Lip-sync Actions
  setLipsyncEnabled: (enabled) => set({ lipsyncEnabled: enabled }),
  setLipsyncMode: (mode) => set({ lipsyncMode: mode }),
  setFaceFileId: (id) => set({ faceFileId: id }),
}));

