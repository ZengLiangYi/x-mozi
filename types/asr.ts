/**
 * ASR (语音识别) 相关类型定义
 */

/**
 * 腾讯云实时 ASR 响应类型
 * @see https://cloud.tencent.com/document/product/1093/48982
 */
export interface TencentAsrResponse {
  /** 状态码，0 表示成功 */
  code: number;
  /** 状态消息 */
  message: string;
  /** 语音 ID */
  voice_id?: string;
  /** 识别结果 */
  result?: TencentAsrResult;
}

/**
 * 腾讯云 ASR 识别结果
 */
export interface TencentAsrResult {
  /** 
   * 识别结果类型
   * - 0: 一段话开始
   * - 1: 一段话中间（临时结果）
   * - 2: 一段话结束（VAD 检测到静音）
   */
  slice_type: number;
  /** 识别的文本内容 */
  voice_text_str: string;
  /** 词级别时间戳（如果请求时开启了 word_info） */
  word_list?: TencentAsrWord[];
}

/**
 * 腾讯云 ASR 词信息
 */
export interface TencentAsrWord {
  /** 词内容 */
  word: string;
  /** 开始时间（毫秒） */
  start_time: number;
  /** 结束时间（毫秒） */
  end_time: number;
}

/**
 * 实时 ASR 参数配置
 */
export interface RealtimeAsrParams {
  /** 引擎模型类型，如 16k_zh */
  engine_model_type: string;
  /** 音频格式：1-pcm, 4-speex, 6-silk, 8-mp3, 10-opus, 12-wav, 14-m4a */
  voice_format: number;
  /** 是否需要 VAD（0: 关闭, 1: 开启） */
  needvad: number;
  /** VAD 静音检测时长（毫秒） */
  vad_silence_time: number;
  /** 热词 ID（可选） */
  hotword_id?: string;
  /** 过滤脏词（0: 不过滤, 1: 过滤） */
  filter_dirty?: number;
  /** 过滤语气词（0: 不过滤, 1: 部分过滤, 2: 严格过滤） */
  filter_modal?: number;
  /** 过滤标点（0: 保留标点, 1: 过滤句末标点, 2: 过滤所有标点） */
  filter_punc?: number;
  /** 数字转换模式（0: 不转换, 1: 智能转换, 3: 全部转换） */
  convert_num_mode?: number;
  /** 是否返回词级别时间戳（0: 不返回, 1: 返回） */
  word_info?: number;
}

/**
 * ASR Slice 类型常量
 */
export const ASR_SLICE_TYPE = {
  /** 一段话开始 */
  START: 0,
  /** 一段话中间（临时结果） */
  MIDDLE: 1,
  /** 一段话结束（VAD 静音） */
  END: 2,
} as const;
