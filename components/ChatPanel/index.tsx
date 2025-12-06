"use client";

import { useChatStore } from "@/store/chatStore";
import { Bubble, Welcome } from "@ant-design/x";
import { GetProp } from "antd";
// 定义 Bubble.List 需要的 items 类型
type BubbleListProps = GetProp<typeof Bubble.List, "items">;

export function ChatPanel() {
  const { messages } = useChatStore();

  // 将 store 中的消息转换为 Bubble.List 需要的格式
  const items: BubbleListProps = messages.map((msg) => ({
    key: msg.id,
    placement: (msg.role === 'user' ? 'end' : 'start') as 'end' | 'start',
    role: msg.role === 'user' ? 'user' : 'ai',
    content: msg.content,
    loading: msg.status === 'loading',
  }));

  return (
    <div className="flex flex-col h-full w-full bg-gray-50">
        {/* 如果没有消息，显示 Welcome */}
        {messages.length === 0 && (
            <div className="p-4">
                <Welcome 
                    title="欢迎使用 X-Mozi"
                    description="我是你的智能助手，支持实时语音对话。"
                />
            </div>
        )}

        {/* 消息列表 - 自动填充剩余空间并支持滚动 */}
        <div className="flex-1 overflow-hidden relative">
            <Bubble.List 
                items={items}
                className="h-full p-4"
                // Bubble.List 内部会自动处理滚动
            />
        </div>
    </div>
  );
}
