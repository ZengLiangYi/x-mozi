import { CozeAPI, ChatEventType, RoleType, COZE_COM_BASE_URL } from '@coze/api';

export const runtime = 'nodejs'; // 强制使用 Node.js runtime

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message) {
      return new Response('Message is required', { status: 400 });
    }

    // 初始化 Coze Client
    // 使用国际版 Base URL: COZE_COM_BASE_URL (https://api.coze.com)
    const client = new CozeAPI({
      token: process.env.COZE_API_KEY!,
      baseURL: COZE_COM_BASE_URL,
      allowPersonalAccessTokenInBrowser: false,
    });

    const botId = process.env.COZE_BOT_ID!;
    const userId = 'x-mozi';

    // 使用 chat.stream 接口发起对话
    const stream = await client.chat.stream({
      bot_id: botId,
      user_id: userId,
      additional_messages: [
        {
          role: RoleType.User,
          content: message,
          content_type: 'text',
        },
      ],
      auto_save_history: true,
    });

    // 创建 ReadableStream 返回给前端
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of stream) {
            if (part.event === ChatEventType.CONVERSATION_MESSAGE_DELTA) {
              const content = part.data.content;
              // 发送 SSE 格式数据
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }
             // 可以处理其他事件，如 CONVERSATION_CHAT_COMPLETED
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Coze stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
