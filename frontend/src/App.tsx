import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { DrivePage } from './pages/DrivePage';
import { OAuthCallback } from './pages/OAuthCallback';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <BrowserRouter>
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

          {/* Fallback 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
