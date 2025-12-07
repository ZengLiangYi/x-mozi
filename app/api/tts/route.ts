import * as tencentcloud from 'tencentcloud-sdk-nodejs';

const TtsClient = tencentcloud.tts.v20190823.Client;

/** 最大文本长度 */
const MAX_TEXT_LENGTH = 5000;

/**
 * POST /api/tts
 * 文字转语音 - 将文本转换为音频
 */
export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return Response.json(
        { error: '请提供有效的文本内容' },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json(
        { error: `文本长度超过限制 (最大 ${MAX_TEXT_LENGTH} 字符)` },
        { status: 400 }
      );
    }

    // 验证环境变量
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;

    if (!secretId || !secretKey) {
      console.error('TTS: 腾讯云凭证未配置');
      return Response.json(
        { error: '服务配置错误' },
        { status: 500 }
      );
    }

    const client = new TtsClient({
      credential: {
        secretId,
        secretKey,
      },
      region: 'ap-guangzhou',
      profile: {
        signMethod: 'TC3-HMAC-SHA256',
        httpProfile: {
          reqMethod: 'POST',
          reqTimeout: 30,
          ...(process.env.TENCENT_PROXY && { proxy: process.env.TENCENT_PROXY }),
        },
      },
    });

    const result = await client.TextToVoice({
      Text: text,
      SessionId: Date.now().toString(),
      ModelType: 1,
      VoiceType: 101013,
      Volume: 0,
      Speed: 0,
      ProjectId: 0,
      Codec: 'mp3',
    });

    if (!result.Audio) {
      throw new Error('未收到音频数据');
    }

    return Response.json({ audio: result.Audio });

  } catch (error) {
    console.error('TTS 错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return Response.json(
      { error: '语音合成失败', details: errorMessage },
      { status: 500 }
    );
  }
}
