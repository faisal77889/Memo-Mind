import axios, { AxiosError } from 'axios';
import type { DriveFile, DriveFilesResponse, GoogleAuthUrlResponse, AuthTokenResponse } from '../types';

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
