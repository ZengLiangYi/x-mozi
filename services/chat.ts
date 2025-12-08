import request from '@/utils/request';
import { Language } from '@/store/languageStore';

/**
 * 流式聊天
 * @param message 用户消息
 * @param onMessage 收到消息回调
 * @throws 请求失败时抛出 RequestError
 */
export interface ChatStreamOptions {
  language?: Language;
  systemPrompt?: string;
}

export async function chatStream(
  message: string,
  onMessage: (content: string) => void,
  options?: ChatStreamOptions
): Promise<void> {
  await request.stream(
    '/api/chat',
    {
      message,
      language: options?.language,
      systemPrompt: options?.systemPrompt,
    },
    onMessage,
    { timeout: 60000 } // Chat 60秒超时
  );
}
