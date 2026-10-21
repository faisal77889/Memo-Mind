import axios, { AxiosError } from 'axios';
import type {
  DriveFile,
  DriveFilesResponse,
  GoogleAuthUrlResponse,
  AuthTokenResponse,
  GmailListResponse,
  ChatSession,
  ChatSessionDetail,
  ChatActivityStats,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to extract clean error message from Axios errors
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string | object; message?: string }>;
    if (axiosError.response?.data) {
      const data = axiosError.response.data;
      if (typeof data.detail === 'string') return data.detail;
      if (typeof data.detail === 'object') return JSON.stringify(data.detail);
      if (data.message) return data.message;
    }
    return axiosError.message || 'An error occurred during network request';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * 1. Fetch Google OAuth Authorization URL from backend
 */
export async function getGoogleLoginUrl(prompt?: string, email?: string): Promise<GoogleAuthUrlResponse> {
  const response = await apiClient.get<GoogleAuthUrlResponse>('/google/login', {
    params: {
      ...(prompt ? { prompt } : {}),
      ...(email ? { email } : {}),
    },
  });
  return response.data;
}

/**
 * 2. Exchange Google OAuth authorization code for backend JWT token
 */
export async function authGoogle(code: string): Promise<AuthTokenResponse> {
  const response = await apiClient.get<AuthTokenResponse>('/auth/google', {
    params: { code },
  });
  return response.data;
}

/**
 * 3. Fetch Google Drive files for the authenticated user
 */
export async function getDriveFiles(token: string, pageSize: number = 50): Promise<DriveFilesResponse> {
  const response = await apiClient.get<DriveFilesResponse>('/google/drive/files', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params: {
      page_size: pageSize,
    },
  });
  return response.data;
}

/**
 * 4. Fetch specific Google Drive file metadata & web link
 */
export async function getDriveFile(token: string, fileId: string): Promise<DriveFile> {
  const response = await apiClient.get<DriveFile>(`/google/drive/files/${fileId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

/**
 * 5. Search Google Drive files
 */
export async function searchDriveFiles(token: string, query: string, pageSize: number = 50): Promise<DriveFilesResponse> {
  const response = await apiClient.get<DriveFilesResponse>('/google/drive/search', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params: {
      q: query,
      page_size: pageSize,
    },
  });
  return response.data;
}

/**
 * 6. Trigger Synchronization (Google Drive, Gmail, or Both)
 */
export async function triggerSync(token: string, source?: 'gdrive' | 'gmail'): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>(
    '/sync-message',
    null,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: source ? { source } : {},
    }
  );
  return response.data;
}

/**
 * 7. Poll Celery Background Task Status
 */
export async function getTaskStatus(token: string, taskId: string): Promise<any> {
  const response = await apiClient.get(`/task/status/${taskId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

/**
 * 8. Real-time Streaming AI Chat with Session Context
 */
export async function streamAiMessage(
  query: string,
  onChunk: (chunk: string) => void,
  onComplete: (chatId?: number) => void,
  onError: (err: any) => void,
  signal?: AbortSignal,
  chatId?: number,
  token?: string | null
): Promise<void> {
  try {
    const params = new URLSearchParams({ query });
    if (chatId) {
      params.append('chat_id', chatId.toString());
    }
    if (token) {
      params.append('token', token);
    }

    const url = `${API_BASE_URL}/ai-message?${params.toString()}`;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { signal, headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Chat error (${response.status}): ${errorText || response.statusText}`);
    }

    // Capture created or active chat id header if returned
    const headerChatId = response.headers.get('X-Chat-Id');
    const returnedChatId = headerChatId ? parseInt(headerChatId, 10) : chatId;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Unable to read stream from AI service');
    }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) {
        onChunk(text);
      }
    }
    onComplete(returnedChatId);
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    onError(err);
  }
}

/**
 * Chat Session Management APIs
 */
export async function fetchChatSessions(token: string): Promise<ChatSession[]> {
  const response = await apiClient.get<ChatSession[]>('/chat/sessions', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function createChatSession(token: string, title?: string): Promise<ChatSession> {
  const response = await apiClient.post<ChatSession>(
    '/chat/sessions',
    { title: title || 'New Conversation' },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
}

export async function fetchChatSessionDetails(token: string, chatId: number): Promise<ChatSessionDetail> {
  const response = await apiClient.get<ChatSessionDetail>(`/chat/sessions/${chatId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function renameChatSession(token: string, chatId: number, title: string): Promise<ChatSession> {
  const response = await apiClient.patch<ChatSession>(
    `/chat/sessions/${chatId}`,
    { title },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
}

export async function deleteChatSession(token: string, chatId: number): Promise<void> {
  await apiClient.delete(`/chat/sessions/${chatId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchChatActivityStats(token: string): Promise<ChatActivityStats> {
  const response = await apiClient.get<ChatActivityStats>('/chat/activity-stats', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

/**
 * 9. Download and index an individual Google Drive file into Memo Mind library
 */
export async function downloadAndIndexDriveFile(token: string, fileId: string): Promise<{ message: string }> {
  const response = await apiClient.get<{ message: string }>(`/download/google/drive/files/${fileId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

/**
 * 10. Fetch Gmail message identifiers for the authenticated user
 */
export async function getGmailList(token: string, maxResults: number = 25): Promise<GmailListResponse> {
  const response = await apiClient.get<GmailListResponse>('/gmail/list', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params: {
      max_results: maxResults,
    },
  });
  return response.data;
}

/**
 * 11. Download, extract content, and index an individual Gmail message into Memo Mind library
 */
export async function syncGmailMessage(token: string, messageId: string): Promise<{ message: string }> {
  const response = await apiClient.get<{ message: string }>(`/gmail/messages/${messageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

