import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * 统一响应格式
 */
export interface ApiResponse<T = unknown> {
  data: T;
  success: boolean;
  message?: string;
}

/**
 * 请求错误类型
 */
export class RequestError extends Error {
  code: number;
  details?: string;

  constructor(message: string, code: number = 500, details?: string) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 请求配置
 */
const DEFAULT_CONFIG: AxiosRequestConfig = {
  baseURL: '',
  timeout: 30000, // 30 秒超时
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * 创建 axios 实例
 */
const instance: AxiosInstance = axios.create(DEFAULT_CONFIG);

/**
 * 请求拦截器
 */
instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 可以在这里添加 token 等认证信息
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error: AxiosError) => {
    console.error('请求配置错误:', error);
    return Promise.reject(new RequestError('请求配置错误', 400));
  }
);

/**
 * 响应拦截器
 */
instance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError<{ error?: string; details?: string }>) => {
    // 处理超时
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new RequestError('请求超时，请稍后重试', 408));
    }

    // 处理网络错误
    if (!error.response) {
      return Promise.reject(new RequestError('网络连接失败，请检查网络', 0));
    }

    // 处理服务端错误
    const { status, data } = error.response;
    const message = data?.error || getErrorMessage(status);
    const details = data?.details;

    return Promise.reject(new RequestError(message, status, details));
  }
);

/**
 * 根据状态码获取错误消息
 */
function getErrorMessage(status: number): string {
  const messages: Record<number, string> = {
    400: '请求参数错误',
    401: '未授权，请重新登录',
    403: '拒绝访问',
    404: '请求的资源不存在',
    500: '服务器内部错误',
    502: '网关错误',
    503: '服务暂不可用',
    504: '网关超时',
  };
  return messages[status] || `请求失败 (${status})`;
}

/**
 * 统一请求方法
 */
export const request = {
  /**
   * GET 请求
   */
  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await instance.get<T>(url, config);
    return response.data;
  },

  /**
   * POST 请求
   */
  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await instance.post<T>(url, data, config);
    return response.data;
  },

  /**
   * POST FormData 请求
   */
  async postForm<T = unknown>(
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await instance.post<T>(url, formData, {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * PUT 请求
   */
  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await instance.put<T>(url, data, config);
    return response.data;
  },

  /**
   * DELETE 请求
   */
  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await instance.delete<T>(url, config);
    return response.data;
  },

  /**
   * 流式请求 (用于 SSE)
   * 注意：axios 不直接支持 SSE，这里使用 fetch
   * @param signal 外部 AbortSignal，用于取消请求（如用户打断）
   */
  async stream(
    url: string,
    data: unknown,
    onMessage: (content: string) => void,
    config?: { timeout?: number; signal?: AbortSignal }
  ): Promise<void> {
    // 如果有外部 signal，使用它；否则创建内部 controller 用于超时
    const internalController = new AbortController();
    const timeoutId = setTimeout(
      () => internalController.abort(),
      config?.timeout || 60000
    );

    // 监听外部 signal，触发内部 abort
    const externalSignal = config?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        throw new RequestError('请求已取消', 0);
      }
      externalSignal.addEventListener('abort', () => internalController.abort());
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: internalController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new RequestError(
          errorData.error || `请求失败 (${response.status})`,
          response.status,
          errorData.details
        );
      }

      if (!response.body) {
        throw new RequestError('服务器响应为空', 500);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const { content } = JSON.parse(data);
              if (content) {
                onMessage(content);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof RequestError) {
        throw error;
      }
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          // 区分外部取消和内部超时
          if (externalSignal?.aborted) {
            throw new RequestError('请求已取消', 0);
          }
          throw new RequestError('请求超时', 408);
        }
        throw new RequestError(error.message, 500);
      }
      
      throw new RequestError('请求失败', 500);
    }
  },
};

/**
 * 导出 axios 实例，用于特殊场景
 */
export { instance as axiosInstance };

export default request;
