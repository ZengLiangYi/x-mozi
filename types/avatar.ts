export type AvatarAction = 'idle' | 'talk' | 'dance';

export interface AvatarModel {
  id: string;
  name: string;
  videos: {
    idle: string;
    talk: string;
    dance: string;
  };
}

export const AVATAR_LIST: AvatarModel[] = [
  {
    id: '1',
    name: '形象 1',
    videos: {
      idle: '/videos/avatar-1-idle.mp4',
      talk: '/videos/avatar-1-talk.mp4',
      dance: '/videos/avatar-1-dance.mp4',
    },
  },
  {
    id: '2',
    name: '形象 2',
    videos: {
      idle: '/videos/avatar-2-idle.mp4',
      talk: '/videos/avatar-2-talk.mp4',
      dance: '/videos/avatar-2-dance.mp4',
    },
  },
  {
    id: '3',
    name: '形象 3',
    videos: {
      idle: '/videos/avatar-3-idle.mp4',
      talk: '/videos/avatar-3-talk.mp4',
      dance: '/videos/avatar-3-dance.mp4',
    },
  },
  {
    id: '4',
    name: '形象 4',
    videos: {
      idle: '/videos/avatar-4-idle.mp4',
      talk: '/videos/avatar-4-talk.mp4',
      dance: '/videos/avatar-4-dance.mp4',
    },
  },
  {
    id: '5',
    name: '形象 5',
    videos: {
      idle: '/videos/avatar-5-idle.mp4',
      talk: '/videos/avatar-5-talk.mp4',
      dance: '/videos/avatar-5-dance.mp4',
    },
  },
];

