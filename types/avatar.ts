export type AvatarAction = 'idle' | 'talk' | 'dance';

export interface AvatarModel {
  id: string;
  name: string;
  thumbnail: string;
  videos: {
    idle: string;
    talk: string;
    dance: string;
  };
}

/**
 * 创建 Avatar 模型数据
 * @param id Avatar ID
 * @param name 显示名称
 */
function createAvatar(id: string, name: string): AvatarModel {
  const basePath = `/videos/avatar-${id}`;
  return {
    id,
    name,
    thumbnail: `/avatars/avatar-${id}.png`,
    videos: {
      idle: `${basePath}/avatar-${id}-idle.mp4`,
      talk: `${basePath}/avatar-${id}-talk.mp4`,
      dance: `${basePath}/avatar-${id}-dance.mp4`,
    },
  };
}

/**
 * Avatar 形象列表
 */
export const AVATAR_LIST: AvatarModel[] = [
  createAvatar('1', '形象 1'),
  createAvatar('2', '形象 2'),
  // createAvatar('3', '形象 3'),
  // createAvatar('4', '形象 4'),
  // createAvatar('5', '形象 5'),
];

/**
 * 根据 ID 获取 Avatar
 */
export function getAvatarById(id: string): AvatarModel | undefined {
  return AVATAR_LIST.find(avatar => avatar.id === id);
}

/**
 * 获取默认 Avatar
 */
export function getDefaultAvatar(): AvatarModel {
  return AVATAR_LIST[0];
}
