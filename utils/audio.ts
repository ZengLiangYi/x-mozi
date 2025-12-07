/**
 * 音频处理工具函数
 * 提供音频格式转换、重采样等功能
 */

/**
 * 获取兼容的 AudioContext 类
 * 兼容 Safari 的 webkitAudioContext
 */
export function getAudioContextClass(): typeof AudioContext {
  return window.AudioContext || 
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
}

/**
 * 创建 AudioContext 实例
 * @param options AudioContext 配置选项
 */
export function createAudioContext(options?: AudioContextOptions): AudioContext {
  const AudioContextClass = getAudioContextClass();
  return new AudioContextClass(options);
}

/**
 * Float32Array 转 Int16Array (PCM 格式)
 * 用于将 Web Audio API 的浮点音频数据转换为 16 位 PCM
 * @param float32Array 浮点音频数据 (-1.0 到 1.0)
 * @returns 16 位 PCM 音频数据
 */
export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // 限制在 -1 到 1 范围内
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    // 转换为 16 位整数
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return int16Array;
}

/**
 * 音频重采样到目标采样率
 * 使用线性插值进行重采样
 * @param audioData 原始音频数据
 * @param originalSampleRate 原始采样率
 * @param targetSampleRate 目标采样率，默认 16000Hz
 * @returns 重采样后的音频数据
 */
export function resampleAudio(
  audioData: Float32Array,
  originalSampleRate: number,
  targetSampleRate: number = 16000
): Float32Array {
  if (originalSampleRate === targetSampleRate) {
    return audioData;
  }

  const ratio = originalSampleRate / targetSampleRate;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
    const t = srcIndex - srcIndexFloor;
    // 线性插值
    result[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
  }

  return result;
}

/**
 * 将音频数据转换为可发送的 PCM Buffer
 * 组合了重采样和格式转换
 * @param audioData 原始音频数据
 * @param originalSampleRate 原始采样率
 * @returns PCM 格式的 ArrayBuffer
 */
export function audiaToPcmBuffer(
  audioData: Float32Array,
  originalSampleRate: number
): ArrayBuffer {
  const resampled = resampleAudio(audioData, originalSampleRate, 16000);
  const pcmData = float32ToInt16(resampled);
  // 创建新的 ArrayBuffer 并复制数据，确保返回类型为 ArrayBuffer
  const buffer = new ArrayBuffer(pcmData.byteLength);
  new Int16Array(buffer).set(pcmData);
  return buffer;
}
