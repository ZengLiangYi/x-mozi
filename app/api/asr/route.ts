import * as tencentcloud from 'tencentcloud-sdk-nodejs';

const AsrClient = tencentcloud.asr.v20190614.Client;

/**
 * POST /api/asr
 * 语音识别 - 将音频转换为文字
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return Response.json(
        { error: '请提供音频文件' },
        { status: 400 }
      );
    }

    // 将 File 转换为 Buffer (Base64)
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    if (buffer.length === 0) {
      return Response.json(
        { error: '音频数据为空' },
        { status: 400 }
      );
    }
    
    const base64Audio = buffer.toString('base64');
    
    // 前端已统一转为 WAV 格式 (16kHz 单声道)
    const voiceFormat = 'wav';
    console.log(`ASR: 收到 ${buffer.length} 字节, 格式: ${voiceFormat}`);

    // 验证环境变量
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;
    
    if (!secretId || !secretKey) {
      console.error('ASR: 腾讯云凭证未配置');
      return Response.json(
        { error: '服务配置错误' },
        { status: 500 }
      );
    }

    const client = new AsrClient({
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

    const result = await client.SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: '16k_zh',
      SourceType: 1,
      VoiceFormat: voiceFormat,
      UsrAudioKey: Date.now().toString(),
      Data: base64Audio,
      DataLen: buffer.length,
    });

    return Response.json({ text: result.Result || '' });

  } catch (error) {
    console.error('ASR 错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return Response.json(
      { error: '语音识别失败', details: errorMessage },
      { status: 500 }
    );
  }
}
