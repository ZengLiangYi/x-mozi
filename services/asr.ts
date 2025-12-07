import request from '@/utils/request';

/** ASR 响应类型 */
interface AsrResponse {
  text: string;
}

/**
 * 语音转文字
 * @param audioBlob 音频数据
 * @returns 识别的文本
 * @throws 识别失败时抛出 RequestError
 */
export async function speechToText(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.mp3');

  const data = await request.postForm<AsrResponse>('/api/asr', formData, {
    timeout: 30000, // ASR 30秒超时
  });

  return data.text || '';
}
