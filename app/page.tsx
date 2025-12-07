"use client";

import { useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { AvatarVideo } from "@/components/AvatarVideo";
import { ChatPanel } from "@/components/ChatPanel";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import { useWakeWord } from "@/hooks/useWakeWord";
import { useAvatarStore } from "@/store/avatarStore";
import { useChatStore } from "@/store/chatStore";
import { AVATAR_LIST } from "@/types/avatar";
import type { VoiceButtonRef } from "@/components/VoiceButton";
import { DEFAULT_WAKE_WORDS } from "@/constants/audio";

// Dynamic import VoiceButton
const VoiceButton = dynamic(
  () => import("@/components/VoiceButton").then((mod) => mod.VoiceButton),
  { ssr: false }
);

// Expose stores to window for console debugging
if (typeof window !== 'undefined') {
  (window as Window & { avatarStore?: typeof useAvatarStore; chatStore?: typeof useChatStore }).avatarStore = useAvatarStore;
  (window as Window & { chatStore?: typeof useChatStore }).chatStore = useChatStore;
}

export default function Home() {
  const { setAvatarId, currentAvatarId } = useAvatarStore();
  const { isProcessing, handleTextInput } = useVoiceInteraction();
  
  // VoiceButton ref（用于唤醒模式自动触发）
  const voiceButtonRef = useRef<VoiceButtonRef>(null);

  // 识别完成回调 - 发送给 AI
  const handleResult = useCallback((text: string) => {
    console.log('📝 识别完成:', text);
    handleTextInput(text);
  }, [handleTextInput]);

  // 唤醒词触发 - 自动开始录音
  const handleWakeUp = useCallback(() => {
    console.log('🎤 唤醒词触发，自动开始录音');
    // 自动触发录音按钮
    if (voiceButtonRef.current && !isProcessing) {
      voiceButtonRef.current.startRecording();
    }
  }, [isProcessing]);

  // 唤醒词监听
  const { isListening: isWakeListening, startListening, stopListening } = useWakeWord({
    wakeWords: DEFAULT_WAKE_WORDS,
    onWakeUp: handleWakeUp,
  });

  // 暴露唤醒控制到 window（控制台使用）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as Window & { 
        startWakeWord?: () => void; 
        stopWakeWord?: () => void;
        isWakeWordEnabled?: () => boolean;
      }).startWakeWord = () => {
        startListening();
        console.log('🎤 唤醒监听已开启，说"你好墨子"或"墨子"唤醒');
      };
      (window as Window & { stopWakeWord?: () => void }).stopWakeWord = () => {
        stopListening();
        console.log('🎤 唤醒监听已关闭');
      };
      (window as Window & { isWakeWordEnabled?: () => boolean }).isWakeWordEnabled = () => isWakeListening;
    }
  }, [startListening, stopListening, isWakeListening]);

  // Log console usage hint on mount
  useEffect(() => {
    console.log(`
🎮 Avatar 控制台命令:
  avatarStore.getState().setAction('dance')  // 跳舞
  avatarStore.getState().setAction('talk')   // 说话
  avatarStore.getState().setAction('idle')   // 重置
  avatarStore.getState().setAvatarId('2')    // 切换形象 (1-5)
  
💬 Chat 控制台命令:
  chatStore.getState().addMessage({ id: Date.now().toString(), role: 'user', content: '测试', timestamp: Date.now(), status: 'success' })
  chatStore.getState().clearMessages()

🎤 语音唤醒命令:
  startWakeWord()        // 开启唤醒监听
  stopWakeWord()         // 关闭唤醒监听
  isWakeWordEnabled()    // 查看状态
  唤醒词: "你好墨子"、"墨子"、"墨子你好"
    `);
  }, []);

  return (
    <main className="flex flex-col h-full w-full bg-gray-50">
      {/* 顶部主体区域 */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* 左侧区域：智能体展示 (约66%) */}
        <section className="flex flex-col flex-2 h-full border-r border-gray-200 bg-black relative">
          {/* 视频播放容器 - 自适应剩余空间 */}
          <div className="flex-1 w-full flex items-center justify-center overflow-hidden min-h-0 mb-4">
            <div className="relative h-full aspect-9/16 shadow-2xl">
               <AvatarVideo />
            </div>
          </div>

          {/* 形象选择列表 - 浮于左上 */}
          <div className="absolute top-3 z-20 pointer-events-none">
             <div className="flex flex-col gap-2 overflow-y-auto max-h-[70vh] w-24 scrollbar-none pointer-events-auto p-1">
               {AVATAR_LIST.map((avatar) => (
                 <button
                   key={avatar.id}
                   onClick={() => setAvatarId(avatar.id)}
                   className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                     currentAvatarId === avatar.id 
                       ? 'border-blue-500 opacity-100 scale-105 ring-2 ring-blue-500/30' 
                       : 'border-gray-700 opacity-60 hover:opacity-100'
                   }`}
                   title={avatar.name}
                 >
                   <div className="absolute inset-0 bg-gray-800 flex items-center justify-center text-[10px] text-gray-300 font-medium p-1 text-center leading-tight">
                     {avatar.name}
                   </div>
                   <Image 
                     src={avatar.thumbnail} 
                     alt={avatar.name} 
                     fill
                     sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                     className="absolute inset-0 w-full h-full object-cover"
                     onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                     }}
                   />
                 </button>
               ))}
             </div>
          </div>
        </section>

        {/* 右侧区域：对话交互 (约33%) */}
        {false && (
          <section className="flex flex-col flex-1 h-full bg-white relative border-l border-gray-100">
            <ChatPanel />
          </section>
        )}
      </div>

      {/* 底部控制栏 */}
      <div className="h-24 flex items-center justify-center border-t border-gray-800 bg-gray-900 px-8 shrink-0 relative">
        
        {/* 左侧：跳舞按钮 */}
        <div className="absolute left-8 flex items-center gap-2">
          <button
             onClick={() => useAvatarStore.getState().setAction('dance')}
             className="flex items-center gap-2 px-4 py-2 bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 rounded-full border border-pink-600/30 transition-all active:scale-95"
          >
            <span className="text-lg"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16"><path fill="currentColor" d="M7.492.992A.5.5 0 0 0 7 1.5v5.36l-.312.25A.5.5 0 0 0 7 8v2.016L5.242 11.07c-.573.344-.057 1.203.516.86L7 11.184V14H4.5c-.676-.01-.676 1.01 0 1h6c.676.01.676-1.01 0-1H8v-3.418l.184-.11l2.51-.51l.001-.002c.144-.038.305-.159.305-.576V5.5a.5.5 0 0 0-.5-.5l-1.004-.004a.45.45 0 0 0-.319.121L8 6.06V1.5a.5.5 0 0 0-.508-.508M10 2c-.554 0-1 .446-1 1s.446 1 1 1s1-.446 1-1s-.446-1-1-1M9 6.541v2.75l-1 .2V7.34z" strokeWidth="0.8" stroke="currentColor"/></svg></span>
            <span className="text-sm font-medium">跳舞</span>
          </button>
        </div>

        {/* 中间：语音输入按钮 */}
        <div className="flex flex-col items-center gap-1">
           <VoiceButton 
             ref={voiceButtonRef}
             onResult={handleResult}
             isProcessing={isProcessing}
           />
           <span className="text-xs text-gray-400">
            {isProcessing ? '回答中...' : '点击说话'}
           </span>
        </div>

        {/* 右侧：唤醒状态指示（仅在开启时显示） */}
        {false && (
          <div className="absolute right-8 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-green-400">聆听中</span>
          </div>
        )}

      </div>
    </main>
  );
}
