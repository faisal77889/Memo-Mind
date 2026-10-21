export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string | number;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface DriveFilesResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface GoogleAuthUrlResponse {
  url: string;
}

export interface AuthTokenResponse {
  access_token?: string;
  url?: string;
  detail?: string;
}

export interface User {
  id: string | number;
  name?: string;
  email?: string;
  picture?: string;
  role?: string;
}

export interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, userData?: Partial<User>) => void;
  logout: () => void;
  loginWithGoogle: () => Promise<void>;
}

export type SyncSourceType = 'gdrive' | 'gmail';

export interface SyncResponse {
  message: string;
}

export interface TaskStatusResponse {
  task_id: string;
  status: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'RETRY' | string;
  result?: {
    status?: string;
    synced_count?: number;
    errors?: string[] | null;
    detail?: string;
  } | string | null;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  isError?: boolean;
  errorType?: 'rate_limit' | 'context_length' | 'quota' | 'auth' | 'general';
}

export interface GmailMessageItem {
  id: string;
  threadId: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  snippet?: string;
  is_indexed?: boolean;
}

export interface GmailListResponse {
  messages?: GmailMessageItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ChatTurn {
  id: number;
  query: string;
  answer: string;
  order: number;
  created_at: string;
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  total_messages: number;
  last_active: string;
  preview: string;
  activity_level: 'active' | 'recent' | 'idle';
}

export interface ChatSessionDetail {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  total_messages: number;
  turns: ChatTurn[];
}

export interface ChatActivityStats {
  total_conversations: number;
  total_messages: number;
  active_days: number;
  last_active?: string | null;
}
