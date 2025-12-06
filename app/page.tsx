"use client";

import { AvatarVideo } from "@/components/AvatarVideo";
import { useAvatarStore } from "@/store/avatarStore";
import { AVATAR_LIST } from "@/types/avatar";

export default function Home() {
  const { setAvatarId, setAction, currentAvatarId, action } = useAvatarStore();

  return (
    <main className="flex flex-col h-full w-full bg-gray-50">
      {/* 顶部主体区域 */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* 左侧区域：智能体展示 (约66%) */}
        <section className="flex flex-col flex-2 h-full border-r border-gray-200 bg-black relative justify-center items-center p-4">
          {/* 视频播放容器 - 保持 9:16 比例，自适应宽高 */}
          <div className="relative max-h-full max-w-full aspect-9/16 shadow-2xl">
             <AvatarVideo />
          </div>
        </section>

        {/* 右侧区域：对话交互 (约33%) */}
        <section className="flex flex-col flex-1 h-full bg-white relative border-l border-gray-100">
          {/* 对话列表区域 */}
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full h-full bg-blue-50 rounded-lg border-2 border-dashed border-blue-200 flex items-center justify-center text-blue-400">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Chat Section</h2>
                <p>对话交互区域</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 底部全宽控制栏 (占位 + 控制) */}
      <div className="h-32 flex items-center justify-between border-t border-gray-800 bg-gray-900 px-8 gap-4 shrink-0">
        
        {/* 左侧：形象与动作控制 */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-1">
             <span className="text-xs text-gray-500 uppercase tracking-wider">Avatar</span>
             <select 
              value={currentAvatarId}
              onChange={(e) => setAvatarId(e.target.value)}
              className="h-10 px-3 bg-gray-800 text-white rounded border border-gray-700 outline-none focus:border-blue-500 min-w-[140px]"
            >
              {AVATAR_LIST.map((avatar) => (
                <option key={avatar.id} value={avatar.id}>
                  {avatar.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-px h-10 bg-gray-700 mx-2"></div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Actions</span>
            <div className="flex gap-3">
              <button
                onClick={() => setAction("talk")}
                disabled={action !== 'idle'}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  action === 'talk' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                说话
              </button>
              <button
                onClick={() => setAction("dance")}
                disabled={action !== 'idle'}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  action === 'dance' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                跳舞
              </button>
              <button
                onClick={() => setAction("idle")}
                disabled={action === 'idle'}
                className="px-4 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 font-medium disabled:opacity-50"
              >
                重置
              </button>
            </div>
          </div>
        </div>

        {/* 右侧/中间：语音交互按钮 */}
        <div className="flex flex-col items-center gap-2">
           <div className="w-16 h-16 rounded-full bg-red-600 border-4 border-gray-800 flex items-center justify-center text-white text-xl cursor-pointer hover:bg-red-500 hover:scale-105 transition-all shadow-lg shadow-red-900/20">
              🎤
           </div>
           <span className="text-xs text-gray-400 font-medium">点击说话</span>
        </div>

      </div>
    </main>
  );
}
