import { create } from 'zustand';

/** TTS 任务状态 */
export type TTSTaskStatus = 'pending' | 'processing' | 'completed' | 'error';

/** TTS 任务 */
export interface TTSTask {
  id: string;
  /** 任务顺序（用于保证音频播放顺序） */
  order: number;
  /** 要合成的文本 */
  text: string;
  /** 任务状态 */
  status: TTSTaskStatus;
  /** 合成完成的音频数据 */
  audioData?: Uint8Array;
  /** 错误信息 */
  error?: string;
}

interface TTSQueueState {
  /** 任务队列 */
  tasks: TTSTask[];
  /** 下一个任务的顺序号 */
  nextOrder: number;
  /** 下一个要播放的顺序号（保证顺序播放） */
  nextPlayOrder: number;
  /** 当前正在处理的任务数量 */
  processingCount: number;
  /** 是否已全部完成（所有任务都已 completed 或 error） */
  isAllCompleted: boolean;

  // Actions
  /** 添加任务到队列，返回任务 ID */
  addTask: (text: string) => string;
  /** 批量添加任务 */
  addTasks: (texts: string[]) => string[];
  /** 更新任务状态 */
  updateTaskStatus: (
    id: string,
    status: TTSTaskStatus,
    audioData?: Uint8Array,
    error?: string
  ) => void;
  /** 获取下一个待处理的任务 */
  getNextPendingTask: () => TTSTask | null;
  /** 获取下一个可播放的已完成任务（按顺序） */
  getNextPlayableTask: () => TTSTask | null;
  /** 标记任务已播放，更新 nextPlayOrder */
  markAsPlayed: (id: string) => void;
  /** 清空队列 */
  clearQueue: () => void;
  /** 重置状态（用于新的对话） */
  reset: () => void;
}

/** 生成唯一任务 ID */
function generateTaskId(): string {
  return `tts-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useTTSQueueStore = create<TTSQueueState>((set, get) => ({
  tasks: [],
  nextOrder: 0,
  nextPlayOrder: 0,
  processingCount: 0,
  isAllCompleted: true,

  addTask: (text: string) => {
    const id = generateTaskId();
    const order = get().nextOrder;

    set((state) => ({
      tasks: [
        ...state.tasks,
        {
          id,
          order,
          text,
          status: 'pending',
        },
      ],
      nextOrder: state.nextOrder + 1,
      isAllCompleted: false,
    }));

    return id;
  },

  addTasks: (texts: string[]) => {
    const ids: string[] = [];
    const currentOrder = get().nextOrder;

    const newTasks: TTSTask[] = texts.map((text, index) => {
      const id = generateTaskId();
      ids.push(id);
      return {
        id,
        order: currentOrder + index,
        text,
        status: 'pending' as const,
      };
    });

    set((state) => ({
      tasks: [...state.tasks, ...newTasks],
      nextOrder: state.nextOrder + texts.length,
      isAllCompleted: false,
    }));

    return ids;
  },

  updateTaskStatus: (id, status, audioData, error) => {
    set((state) => {
      const newTasks = state.tasks.map((task) =>
        task.id === id ? { ...task, status, audioData, error } : task
      );

      // 计算新的 processingCount
      const processingCount = newTasks.filter(
        (t) => t.status === 'processing'
      ).length;

      // 检查是否全部完成
      const isAllCompleted =
        newTasks.length > 0 &&
        newTasks.every((t) => t.status === 'completed' || t.status === 'error');

      return {
        tasks: newTasks,
        processingCount,
        isAllCompleted,
      };
    });
  },

  getNextPendingTask: () => {
    const { tasks } = get();
    // 按 order 排序，返回第一个 pending 的任务
    const pending = tasks
      .filter((t) => t.status === 'pending')
      .sort((a, b) => a.order - b.order);
    return pending[0] || null;
  },

  getNextPlayableTask: () => {
    const { tasks, nextPlayOrder } = get();
    // 找到 order === nextPlayOrder 且已完成的任务
    const task = tasks.find(
      (t) => t.order === nextPlayOrder && t.status === 'completed' && t.audioData
    );
    return task || null;
  },

  markAsPlayed: (id: string) => {
    set((state) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return state;

      return {
        nextPlayOrder: state.nextPlayOrder + 1,
      };
    });
  },

  clearQueue: () => {
    set({
      tasks: [],
      nextOrder: 0,
      nextPlayOrder: 0,
      processingCount: 0,
      isAllCompleted: true,
    });
  },

  reset: () => {
    set({
      tasks: [],
      nextOrder: 0,
      nextPlayOrder: 0,
      processingCount: 0,
      isAllCompleted: true,
    });
  },
}));

/**
 * 选择器：获取队列统计信息
 */
export const selectQueueStats = () => {
  const { tasks, processingCount } = useTTSQueueStore.getState();
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const errorCount = tasks.filter((t) => t.status === 'error').length;

  return {
    total: tasks.length,
    pending: pendingCount,
    processing: processingCount,
    completed: completedCount,
    error: errorCount,
  };
};
