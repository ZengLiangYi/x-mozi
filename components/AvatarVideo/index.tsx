"use client";

import { useCallback } from "react";
import { useAvatarStore } from "@/store/avatarStore";
import { AVATAR_LIST } from "@/types/avatar";
import styles from "./style.module.css";

/**
 * Avatar 视频播放组件
 * 根据当前状态（idle/talk/dance）播放对应视频
 */
export function AvatarVideo() {
  const { currentAvatarId, action, setAction } = useAvatarStore();
  
  // 获取当前形象数据
  const currentAvatar = AVATAR_LIST.find((a) => a.id === currentAvatarId) || AVATAR_LIST[0];
  
  // 获取当前状态对应的视频路径
  const currentVideoSrc = currentAvatar.videos[action];

  // 是否循环播放 (跳舞状态不循环)
  const isLoop = action !== "dance";

  // 处理视频结束事件
  const handleEnded = useCallback(() => {
    if (action === "dance") {
      setAction("idle");
    }
  }, [action, setAction]);

  // 处理视频加载错误
  const handleError = useCallback(() => {
    console.error(`视频加载失败: ${currentVideoSrc}`);
  }, [currentVideoSrc]);

  return (
    <div className={styles.container}>
      <video
        key={`${currentAvatarId}-${action}`} // key 变化触发重新加载
        src={currentVideoSrc}
        className={styles.video}
        autoPlay
        playsInline
        muted // 添加 muted 避免自动播放策略问题
        loop={isLoop}
        onEnded={handleEnded}
        onError={handleError}
      />
    </div>
  );
}
