"use client";

import { useEffect, useRef, useState } from "react";
import { useAvatarStore } from "@/store/avatarStore";
import { AVATAR_LIST } from "@/types/avatar";
import styles from "./style.module.css";

export function AvatarVideo() {
  const { currentAvatarId, action, setAction } = useAvatarStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // 获取当前形象数据
  const currentAvatar = AVATAR_LIST.find((a) => a.id === currentAvatarId) || AVATAR_LIST[0];
  
  // 获取当前状态对应的视频路径
  const currentVideoSrc = currentAvatar.videos[action];

  // 是否循环播放 (跳舞状态不循环)
  const isLoop = action !== "dance";

  // 处理视频结束事件
  const handleEnded = () => {
    if (action === "dance") {
      setAction("idle");
    }
  };

  return (
    <div className={styles.container}>
      <video
        ref={videoRef}
        key={`${currentAvatarId}-${action}`} // key 变化触发重新加载
        src={currentVideoSrc}
        className={styles.video}
        autoPlay
        muted
        playsInline
        loop={isLoop}
        onEnded={handleEnded}
        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
      />
    </div>
  );
}
