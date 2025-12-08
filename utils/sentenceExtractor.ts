/**
 * 句子提取工具
 * 用于从流式文本中实时提取完整句子
 */

export interface ExtractResult {
  /** 提取出的完整句子 */
  completeSentences: string[];
  /** 剩余的不完整文本 */
  remaining: string;
}

/** 句子结束标点（中英文） */
const SENTENCE_ENDERS = /([。？！!?；;])/;

/** 常见英文缩写，避免误分割 */
const ABBREVIATIONS = [
  'Mr.',
  'Mrs.',
  'Ms.',
  'Dr.',
  'Prof.',
  'Sr.',
  'Jr.',
  'vs.',
  'etc.',
  'i.e.',
  'e.g.',
  'a.m.',
  'p.m.',
  'Inc.',
  'Ltd.',
  'Co.',
  'Corp.',
  'St.',
  'Ave.',
  'Blvd.',
  'Rd.',
  'No.',
  'Vol.',
  'Fig.',
  'al.',
];

/** 默认最小句子长度（字符数） */
const DEFAULT_MIN_LENGTH = 8;

/**
 * 检查文本是否以缩写结尾
 */
function endsWithAbbreviation(text: string): boolean {
  const trimmed = text.trimEnd();
  return ABBREVIATIONS.some((abbr) =>
    trimmed.toUpperCase().endsWith(abbr.toUpperCase())
  );
}

/**
 * 检查是否是纯标点或空白
 */
function isPunctuationOnly(text: string): boolean {
  return /^[\s\p{P}]*$/u.test(text);
}

/**
 * 从文本中提取完整句子
 *
 * @param text 输入文本（可能包含多个句子）
 * @param minLength 最小句子长度，低于此长度的句子会与下一句合并（默认 8）
 * @returns 完整句子数组和剩余文本
 *
 * @example
 * extractSentences("你好。我是AI。正在")
 * // { completeSentences: ["你好。", "我是AI。"], remaining: "正在" }
 */
export function extractSentences(
  text: string,
  minLength: number = DEFAULT_MIN_LENGTH
): ExtractResult {
  if (!text || !text.trim()) {
    return { completeSentences: [], remaining: text };
  }

  const completeSentences: string[] = [];
  let buffer = '';

  // 按句子结束标点分割，保留标点
  const parts = text.split(SENTENCE_ENDERS);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // 检查是否是标点
    if (SENTENCE_ENDERS.test(part)) {
      // 将标点附加到当前 buffer
      buffer += part;

      // 检查是否是缩写（如 Mr. Dr.）
      if (endsWithAbbreviation(buffer)) {
        // 是缩写，不分割，继续累积
        continue;
      }

      // 检查 buffer 长度是否足够
      const trimmedBuffer = buffer.trim();
      if (trimmedBuffer.length >= minLength && !isPunctuationOnly(trimmedBuffer)) {
        completeSentences.push(trimmedBuffer);
        buffer = '';
      }
      // 如果长度不够，继续累积到下一句
    } else {
      // 普通文本，累积到 buffer
      buffer += part;
    }
  }

  return {
    completeSentences,
    remaining: buffer,
  };
}

/**
 * 强制分割长文本（用于处理剩余文本或超长句子）
 * 按最大长度硬切分
 *
 * @param text 输入文本
 * @param maxLength 最大长度（默认 150，与 TTS API 限制对齐）
 */
export function forceSplitText(text: string, maxLength: number = 150): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLength) return [trimmed];

  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += maxLength) {
    const chunk = trimmed.slice(i, i + maxLength).trim();
    if (chunk) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * 清理 Markdown 格式（与后端 cleanMarkdown 保持一致）
 */
export function cleanMarkdown(text: string): string {
  return text
    // 移除标题行
    .replace(/^#{1,6}\s+.*$/gm, '')
    // 移除粗体
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // 移除斜体
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // 移除链接，保留文字
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 移除图片
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // 移除行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 移除代码块
    .replace(/```[\s\S]*?```/g, '')
    // 移除分隔线
    .replace(/^-{3,}$/gm, '')
    // 压缩多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 处理最终剩余文本
 * 将剩余文本进行清理和必要的分割
 *
 * @param remaining 剩余的不完整文本
 * @param maxLength 最大长度
 */
export function processRemainingText(
  remaining: string,
  maxLength: number = 150
): string[] {
  const trimmed = remaining.trim();
  if (!trimmed || isPunctuationOnly(trimmed)) {
    return [];
  }

  // 如果剩余文本超长，强制分割
  if (trimmed.length > maxLength) {
    return forceSplitText(trimmed, maxLength);
  }

  return [trimmed];
}
