import * as tencentcloud from 'tencentcloud-sdk-nodejs';

const TtsClient = tencentcloud.tts.v20190823.Client;

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return new Response('Text is required', { status: 400 });
    }

    const client = new TtsClient({
      credential: {
        secretId: process.env.TENCENT_SECRET_ID!,
        secretKey: process.env.TENCENT_SECRET_KEY!,
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
      ModelType: 1, // 默认模型
      VoiceType: 101013,
      Volume: 0,
      Speed: 0,
      ProjectId: 0,
      Codec: 'mp3',
    });

    if (!result.Audio) {
      throw new Error('No audio data received');
    }

    return Response.json({ audio: result.Audio });

  } catch (error) {
    console.error('TTS API Error:', error);
    return new Response(JSON.stringify({ error: 'TTS Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

