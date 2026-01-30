"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAvatarStore } from "@/store/avatarStore";
import { AVATAR_LIST } from "@/types/avatar";
import { uploadFaceImage } from "@/services/lipsync";
import styles from "./style.module.css";

/**
 * Avatar 视频播放组件
 * 根据当前状态（idle/talk/dance/think）播放对应视频
 * 当 action = 'talk' 且 lipsync 启用时，显示 Canvas 渲染对口型帧
 */
export function AvatarVideo() {
  const { 
    currentAvatarId, 
    action, 
    setAction,
    lipsyncEnabled,
    lipsyncMode,
    faceFileId,
    setFaceFileId,
  } = useAvatarStore();
  
  // Canvas ref（由 useLipsyncPlayer 绑定）
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 获取当前形象数据
  const currentAvatar = AVATAR_LIST.find((a) => a.id === currentAvatarId) || AVATAR_LIST[0];
  
  // 获取当前状态对应的视频路径
  const currentVideoSrc = currentAvatar.videos[action];

  // 是否显示 Canvas（talk 状态且 lipsync 启用且正在播放）
  const showCanvas = action === 'talk' && lipsyncEnabled && lipsyncMode === 'playing';
  
  // 是否循环播放 (跳舞状态不循环，think 状态循环)
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

  // 应用启动或 avatar 切换时，自动上传全身照用于对口型
  useEffect(() => {
    if (lipsyncEnabled && currentAvatarId && !faceFileId) {
      console.log('上传 avatar 全身照:', currentAvatar.faceImage);
      uploadFaceImage(currentAvatar.faceImage)
        .then(fileId => {
          console.log('全身照上传成功:', fileId);
          setFaceFileId(fileId);
        })
        .catch(err => {
          console.error('上传全身照失败:', err);
        });
    }
  }, [currentAvatarId, lipsyncEnabled, faceFileId, currentAvatar.faceImage, setFaceFileId]);

  return (
    <div className={styles.container}>
      {/* Video 元素：用于 idle/think/dance 状态，或 lipsync 降级 */}
      <video
        key={`${currentAvatarId}-${action}`}
        src={currentVideoSrc}
        className={`${styles.video} ${showCanvas ? styles.hidden : ''}`}
        autoPlay
        playsInline
        muted={action !== "dance"}
        loop={isLoop}
        onEnded={handleEnded}
        onError={handleError}
      />
      
      {/* Canvas 元素：用于 lip-sync 实时渲染 */}
      <canvas
        ref={canvasRef}
        id="lipsync-canvas"
        className={`${styles.canvas} ${showCanvas ? '' : styles.hidden}`}
      />
    </div>
  );
}

// 导出 canvas ref 获取函数，供 useLipsyncPlayer 使用
export function getLipsyncCanvas(): HTMLCanvasElement | null {
  return document.getElementById('lipsync-canvas') as HTMLCanvasElement | null;
}
