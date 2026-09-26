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
