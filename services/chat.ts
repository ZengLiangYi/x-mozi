import request from '@/utils/request';

/**
 * 流式聊天
 * @param message 用户消息
 * @param onMessage 收到消息回调
 * @throws 请求失败时抛出 RequestError
 */
export async function chatStream(
  message: string,
  onMessage: (content: string) => void
): Promise<void> {
  await request.stream(
    '/api/chat',
    { message },
    onMessage,
    { timeout: 60000 } // Chat 60秒超时
  );
}
