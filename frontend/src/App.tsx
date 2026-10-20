import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { DrivePage } from './pages/DrivePage';
import { GmailPage } from './pages/GmailPage';
import { ChatPage } from './pages/ChatPage';
import { OAuthCallback } from './pages/OAuthCallback';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
          {/* Default redirect to home */}
          <Route path="/" element={<Navigate to="/home" replace />} />

          {/* Authentication routes */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />

          {/* Google OAuth callback redirects */}
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/auth/google" element={<OAuthCallback />} />

          {/* Protected Home page */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />

          {/* Protected Google Drive explorer */}
          <Route
            path="/drive"
            element={
              <ProtectedRoute>
                <DrivePage />
              </ProtectedRoute>
            }
          />

          {/* Protected Gmail Hub */}
          <Route
            path="/gmail"
            element={
              <ProtectedRoute>
                <GmailPage />
              </ProtectedRoute>
            }
          />

          {/* Protected Memo Mind Assistant Chat */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
