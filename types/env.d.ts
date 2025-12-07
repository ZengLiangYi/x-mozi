/**
 * 环境变量类型定义
 */

declare namespace NodeJS {
  interface ProcessEnv {
    /** 腾讯云 App ID */
    TENCENT_APP_ID?: string;
    /** 腾讯云 Secret ID */
    TENCENT_SECRET_ID?: string;
    /** 腾讯云 Secret Key */
    TENCENT_SECRET_KEY?: string;
    /** 腾讯云代理地址（可选） */
    TENCENT_PROXY?: string;
    
    /** Coze API Key */
    COZE_API_KEY?: string;
    /** Coze Bot ID */
    COZE_BOT_ID?: string;
    
    /** Node 环境 */
    NODE_ENV: 'development' | 'production' | 'test';
  }
}
