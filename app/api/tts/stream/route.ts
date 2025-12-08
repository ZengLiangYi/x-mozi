import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import { randomUUID } from 'crypto';
import type { TextToVoiceRequest } from 'tencentcloud-sdk-nodejs/tencentcloud/services/tts/v20190823/tts_models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TtsClient = tencentcloud.tts.v20190823.Client;

/** 单段最大字符（SDK TextToVoice 中文上限约 150） */
const MAX_STREAM_CHARS = 150;
/** 请求总长限制（官方单会话 10000，这里 8000 预留） */
const MAX_REQUEST_CHARS = 8000;

type StreamEvent =
  | { event: 'ready' }
  | { event: 'audio'; data: string }
  | { event: 'status'; data: unknown }
  | { event: 'error'; message: string }
  | { event: 'end' };

/**
 * 清理 Markdown 格式，提取纯文本用于语音合成
 * - 移除 # 开头的标题行
 * - 移除 **粗体**、*斜体* 标记
 * - 移除 [链接](url) 格式，保留链接文字
 * - 移除 `代码` 标记
 * - 移除 --- 分隔线
 */
function cleanMarkdown(text: string): string {
  return text
    // 移除标题行（# 开头的整行）
    .replace(/^#{1,6}\s+.*$/gm, '')
    // 移除粗体标记 **text** 或 __text__，保留内容
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // 移除斜体标记 *text* 或 _text_，保留内容
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // 移除链接 [text](url)，保留链接文字
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 移除图片 ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // 移除行内代码 `code`
    .replace(/`([^`]+)`/g, '$1')
    // 移除代码块 ```...```
    .replace(/```[\s\S]*?```/g, '')
    // 移除分隔线 ---
    .replace(/^-{3,}$/gm, '')
    // 移除多余空行（连续多个换行变成单个）
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_STREAM_CHARS) return [trimmed];

  const sentences = trimmed.split(/(?<=[。？！!?；;])/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;

    if (s.length > MAX_STREAM_CHARS) {
      for (let i = 0; i < s.length; i += MAX_STREAM_CHARS) {
        chunks.push(s.slice(i, i + MAX_STREAM_CHARS));
      }
      continue;
    }

    if ((current + s).length <= MAX_STREAM_CHARS) {
      current += s;
    } else {
      if (current) chunks.push(current);
      current = s;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function toSse(payload: StreamEvent): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text : '';
    const voiceType = typeof body.voiceType === 'number' ? body.voiceType : 101013;
    const speed = typeof body.speed === 'number' ? body.speed : 0;
    const volume = typeof body.volume === 'number' ? body.volume : 0;
    const sampleRate = typeof body.sampleRate === 'number' ? body.sampleRate : 16000;
    const codec = typeof body.codec === 'string' ? body.codec : 'mp3';

    if (!text.trim()) {
      return Response.json({ error: '请提供有效的文本内容' }, { status: 400 });
    }

    if (text.length > MAX_REQUEST_CHARS) {
      return Response.json(
        { error: `文本长度超过限制 (最大 ${MAX_REQUEST_CHARS} 字符)` },
        { status: 400 }
      );
    }

    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;
    const region = process.env.TENCENT_REGION || 'ap-beijing';

    if (!secretId || !secretKey) {
      console.error('TTS Streaming: 腾讯云凭证未配置');
      return Response.json({ error: '服务配置错误' }, { status: 500 });
    }

    const client = new TtsClient({
      credential: { secretId, secretKey },
      region,
      profile: {
        httpProfile: {
          endpoint: 'tts.tencentcloudapi.com',
        },
      },
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendError = (message: string) => {
          controller.enqueue(encoder.encode(toSse({ event: 'error', message })));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        };

        const run = async () => {
          try {
            controller.enqueue(encoder.encode(toSse({ event: 'ready' })));
            // 清理 Markdown 格式后再分段
            const cleanedText = cleanMarkdown(text);
            if (!cleanedText.trim()) {
              controller.enqueue(encoder.encode(toSse({ event: 'end' })));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }
            const chunks = splitText(cleanedText);

            for (const chunk of chunks) {
              const params: TextToVoiceRequest = {
                Text: chunk,
                SessionId: randomUUID(),
                ModelType: 1,
                VoiceType: voiceType,
                Volume: volume,
                Speed: speed,
                ProjectId: 0,
                Codec: codec,
                SampleRate: sampleRate,
              };

              const result = await client.TextToVoice(params);

              if (!result?.Audio) {
                sendError('未收到音频数据');
                return;
              }

              controller.enqueue(
                encoder.encode(toSse({ event: 'audio', data: result.Audio as string }))
              );
            }

            controller.enqueue(encoder.encode(toSse({ event: 'end' })));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (err) {
            const message = err instanceof Error ? err.message : 'TTS 调用失败';
            console.error('TTS Streaming 调用失败:', err);
            sendError(message);
          }
        };

        run();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('TTS Streaming 路由错误:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return Response.json({ error: '语音合成失败', details: message }, { status: 500 });
  }
}
