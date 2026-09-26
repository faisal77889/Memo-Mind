import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthContextType, User } from '../types';
import { getGoogleLoginUrl, authGoogle, getApiErrorMessage } from '../services/api';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'access_token';
const USER_KEY = 'corporate_synapse_user';

export function cleanTokenString(input: string): string {
  if (!input) return '';
  let trimmed = input.trim();

  // If user pasted a JSON string like {"access_token": "..."}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.access_token) return parsed.access_token.trim();
      if (parsed.token) return parsed.token.trim();
    } catch {
      // Not valid JSON, continue regex matching
    }
  }

  // If matches "access_token":"..."
  const jsonMatch = trimmed.match(/"access_token"\s*:\s*"([^"]+)"/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }

  // Remove wrapping quotes if present
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function decodeJwtPayload(token: string): any | null {
  try {
    const cleaned = cleanTokenString(token);
    const parts = cleaned.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    return saved ? cleanTokenString(saved) : null;
  });

  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const login = useCallback((rawToken: string, userData?: Partial<User>) => {
    const cleanedToken = cleanTokenString(rawToken);
    if (!cleanedToken) return;

    localStorage.setItem(TOKEN_KEY, cleanedToken);
    setToken(cleanedToken);

    const payload = decodeJwtPayload(cleanedToken);
    const resolvedUser: User = {
      id: userData?.id || payload?.sub || 'user',
      name: userData?.name || (payload?.sub ? `User #${payload.sub}` : 'Synapse User'),
      email: userData?.email || payload?.email,
      picture: userData?.picture,
      role: userData?.role || payload?.role || 'employee',
    };

    setUser(resolvedUser);
    localStorage.setItem(USER_KEY, JSON.stringify(resolvedUser));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Global URL parameter token / code detector
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const paramToken =
      searchParams.get('access_token') ||
      searchParams.get('token') ||
      hashParams.get('access_token') ||
      hashParams.get('token');

    const paramCode = searchParams.get('code');

    if (paramToken) {
      login(paramToken);
      // Clean query parameters from URL without full reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      setIsLoading(false);
      return;
    }

    if (paramCode) {
      authGoogle(paramCode)
        .then((resp) => {
          if (resp.access_token) {
            login(resp.access_token);
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        })
        .catch((err) => {
          console.error('Auto OAuth code exchange error:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    // Check existing stored token
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload && payload.exp && payload.exp * 1000 < Date.now()) {
        logout();
      } else if (payload && !user) {
        const parsedUser: User = {
          id: payload.sub || 'user',
          name: `User #${payload.sub || ''}`,
          email: payload.email,
          role: payload.role || 'employee',
        };
        setUser(parsedUser);
        localStorage.setItem(USER_KEY, JSON.stringify(parsedUser));
      }
    }

    setIsLoading(false);
  }, [login, logout, token, user]);

  const loginWithGoogle = useCallback(async () => {
    try {
      const response = await getGoogleLoginUrl();
      if (response?.url) {
        // Open Google OAuth consent screen
        window.location.href = response.url;
      } else {
        throw new Error('No authorization URL returned from backend');
      }
    } catch (err: unknown) {
      const errorMsg = getApiErrorMessage(err);
      console.error('Google OAuth URL initialization error:', errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        loginWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
