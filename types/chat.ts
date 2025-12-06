export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  status?: 'loading' | 'success' | 'error';
  timestamp: number;
}

