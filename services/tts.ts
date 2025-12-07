import request, { RequestError } from '@/utils/request';

/** 单次调用腾讯云 TTS 的最大安全字符数（经验值，官方有更低限制） */
const MAX_TTS_CHARS = 300;

/** TTS 响应类型 */
interface TtsResponse {
  audio: string; // base64 编码的音频数据
}

/**
 * Base64 转 Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * 将长文本分段，尽量按句号/问号/感叹号/分号切分，确保每段不超过 MAX_TTS_CHARS
 */
function splitTextToChunks(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_TTS_CHARS) return [trimmed];

  const sentences = trimmed.split(/(?<=[。？！!?；;])/); // 保留标点
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;

    // 如果单句超长，硬切
    if (s.length > MAX_TTS_CHARS) {
      for (let i = 0; i < s.length; i += MAX_TTS_CHARS) {
        chunks.push(s.slice(i, i + MAX_TTS_CHARS));
      }
      continue;
    }

    if ((current + s).length <= MAX_TTS_CHARS) {
      current += s;
    } else {
      if (current) chunks.push(current);
      current = s;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * 文字转语音（自动分段避免超长报错），返回合并后的音频数据
 */
export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const chunks = splitTextToChunks(text);

  const audioParts: Uint8Array[] = [];
  for (const chunk of chunks) {
    const data = await request.post<TtsResponse>(
      '/api/tts',
      { text: chunk },
      { timeout: 30000 } // 单段 30 秒超时
    );

    if (!data.audio) {
      throw new Error('未收到音频数据');
    }

    audioParts.push(base64ToBytes(data.audio));
  }

  // 合并所有片段（MP3 可以按帧顺序拼接播放）
  const totalLength = audioParts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of audioParts) {
    merged.set(part, offset);
    offset += part.length;
  }

  return merged.buffer;
}

interface StreamEvents {
  onAudio: (bytes: Uint8Array) => void | Promise<void>;
  onStatus?: (status: unknown) => void;
}

/**
 * 流式文字转语音（服务端 SSE 下发 base64 音频片段）
 */
export async function streamTextToSpeech(
  text: string,
  events: StreamEvents
): Promise<void> {
  const response = await fetch('/api/tts/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok || !response.body) {
    const errorData = await response.json().catch(() => ({}));
    throw new RequestError(
      errorData.error || `请求失败 (${response.status})`,
      response.status,
      errorData.details
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      if (!chunk.startsWith('data: ')) continue;
      const dataStr = chunk.slice(6).trim();
      if (dataStr === '[DONE]') {
        return;
      }

      try {
        const payload = JSON.parse(dataStr) as
          | { event: 'audio'; data: string }
          | { event: 'status'; data: unknown }
          | { event: 'ready' }
          | { event: 'end' }
          | { event: 'error'; message: string };

        if (payload.event === 'audio') {
          await events.onAudio(base64ToBytes(payload.data));
        } else if (payload.event === 'status' && events.onStatus) {
          events.onStatus(payload.data);
        } else if (payload.event === 'error') {
          throw new RequestError(payload.message, 500);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '流式解析错误';
        throw new RequestError(message, 500);
      }
    }
  }
}
