import { create } from 'zustand';
import { AvatarAction, AVATAR_LIST } from '@/types/avatar';

interface AvatarState {
  currentAvatarId: string;
  action: AvatarAction;
  isPlaying: boolean;
  
  // Actions
  setAvatarId: (id: string) => void;
  setAction: (action: AvatarAction) => void;
  setIsPlaying: (isPlaying: boolean) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  currentAvatarId: AVATAR_LIST[0].id,
  action: 'idle',
  isPlaying: true,

  setAvatarId: (id) => set({ currentAvatarId: id }),
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
}));

