import crypto from 'crypto';
import type { RealtimeAsrParams } from '@/types/asr';

/**
 * 腾讯云实时语音识别 WebSocket 签名生成
 * @see https://cloud.tencent.com/document/product/1093/48982
 */

/** URL 有效期（秒） */
const URL_EXPIRY_SECONDS = 86400; // 24小时

/**
 * 生成 HMAC-SHA1 签名
 */
function generateSignature(secretKey: string, signStr: string): string {
  const hmac = crypto.createHmac('sha1', secretKey);
  hmac.update(signStr);
  return hmac.digest('base64');
}

/**
 * 生成实时 ASR WebSocket URL
 */
function generateRealtimeAsrUrl(
  appId: string,
  secretId: string,
  secretKey: string,
  params: RealtimeAsrParams
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const expired = timestamp + URL_EXPIRY_SECONDS;

  // 构建必需参数
  const queryParams: Record<string, string | number> = {
    secretid: secretId,
    timestamp,
    expired,
    nonce: Math.floor(Math.random() * 100000),
    engine_model_type: params.engine_model_type,
    voice_id: crypto.randomUUID(),
    voice_format: params.voice_format,
    needvad: params.needvad,
    vad_silence_time: params.vad_silence_time,
  };

  // 添加可选参数
  if (params.hotword_id) {
    queryParams.hotword_id = params.hotword_id;
  }
  if (params.filter_dirty !== undefined) {
    queryParams.filter_dirty = params.filter_dirty;
  }
  if (params.filter_modal !== undefined) {
    queryParams.filter_modal = params.filter_modal;
  }
  if (params.filter_punc !== undefined) {
    queryParams.filter_punc = params.filter_punc;
  }
  if (params.convert_num_mode !== undefined) {
    queryParams.convert_num_mode = params.convert_num_mode;
  }
  if (params.word_info !== undefined) {
    queryParams.word_info = params.word_info;
  }

  // 按字典序排序参数
  const sortedKeys = Object.keys(queryParams).sort();
  const queryString = sortedKeys
    .map(key => `${key}=${queryParams[key]}`)
    .join('&');

  // 生成签名原文
  const signStr = `asr.cloud.tencent.com/asr/v2/${appId}?${queryString}`;
  
  // 计算签名
  const signature = generateSignature(secretKey, signStr);
  const encodedSignature = encodeURIComponent(signature);

  // 生成最终 URL
  return `wss://asr.cloud.tencent.com/asr/v2/${appId}?${queryString}&signature=${encodedSignature}`;
}

/**
 * 默认 ASR 配置
 */
const DEFAULT_ASR_CONFIG: RealtimeAsrParams = {
  engine_model_type: '16k_zh',  // 16k 中文模型
  voice_format: 1,              // PCM 格式
  needvad: 1,                   // 开启 VAD
  vad_silence_time: 1000,       // 静音检测 1 秒
  filter_dirty: 1,              // 过滤脏词
  filter_modal: 2,              // 严格过滤语气词
  filter_punc: 0,               // 保留标点
  convert_num_mode: 1,          // 智能转换数字
  word_info: 0,                 // 不需要词级别时间戳
};

/**
 * GET /api/asr/realtime
 * 获取腾讯云实时 ASR WebSocket URL
 */
export async function GET() {
  try {
    const appId = process.env.TENCENT_APP_ID;
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;

    if (!appId || !secretId || !secretKey) {
      return Response.json(
        { error: '腾讯云凭证未配置' },
        { status: 500 }
      );
    }

    const wsUrl = generateRealtimeAsrUrl(
      appId,
      secretId,
      secretKey,
      DEFAULT_ASR_CONFIG
    );

    return Response.json({ url: wsUrl });

  } catch (error) {
    console.error('生成实时 ASR URL 失败:', error);
    return Response.json(
      { error: '生成 ASR URL 失败' },
      { status: 500 }
    );
  }
}
