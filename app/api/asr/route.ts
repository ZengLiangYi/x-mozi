import * as tencentcloud from 'tencentcloud-sdk-nodejs';

const AsrClient = tencentcloud.asr.v20190614.Client;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: 'Audio file is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 将 File 转换为 Buffer (Base64)
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    if (buffer.length === 0) {
      return new Response(JSON.stringify({ error: 'Audio data is empty' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const base64Audio = buffer.toString('base64');
    
    // 前端已统一转为 WAV 格式 (16kHz 单声道)
    const voiceFormat = 'wav';
    console.log(`ASR: Received ${buffer.length} bytes, format: ${voiceFormat}`);

    const client = new AsrClient({
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
          // 可选：通过环境变量配置代理 (例如: http://127.0.0.1:7890)
          ...(process.env.TENCENT_PROXY && { proxy: process.env.TENCENT_PROXY }),
        },
      },
    });

    const result = await client.SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: '16k_zh',
      SourceType: 1,
      VoiceFormat: voiceFormat,
      UsrAudioKey: Date.now().toString(),
      Data: base64Audio,
      DataLen: buffer.length, // 使用实际字节长度，而非 base64 字符串长度
    });

    return Response.json({ text: result.Result || '' });

  } catch (error) {
    console.error('ASR API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'ASR Internal Server Error', details: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

