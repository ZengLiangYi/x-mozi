/**
 * 音频相关常量配置
 */

/** 目标采样率 (Hz) */
export const TARGET_SAMPLE_RATE = 16000;

/** 默认静音超时时间 (毫秒) */
export const DEFAULT_SILENCE_TIMEOUT = 1500;

/** 唤醒词检测冷却时间 (毫秒) - 防止重复触发 */
export const WAKE_WORD_COOLDOWN_MS = 3000;

/** 累积文本最大长度 - 超过后会截断 */
export const MAX_ACCUMULATED_TEXT_LENGTH = 100;

/** 累积文本截断后保留长度 */
export const TRIM_TEXT_TO_LENGTH = 50;

/** WebSocket 重连延迟 (毫秒) */
export const WS_RECONNECT_DELAY = 2000;

/** 默认唤醒词列表 */
export const DEFAULT_WAKE_WORDS = ['你好墨子', '墨子', '墨子你好'];

/** AudioWorklet 处理器路径 */
export const AUDIO_PROCESSOR_PATH = '/audio-processor.js';

/** AudioWorklet 处理器名称 */
export const AUDIO_PROCESSOR_NAME = 'recorder-processor';

/**
 * 麦克风音频约束配置
 */
export const MICROPHONE_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    sampleRate: TARGET_SAMPLE_RATE,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  },
};
