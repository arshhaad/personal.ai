import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { PWAInstallProvider } from './context/PWAInstallContext';
import { useAuth } from './context/useAuth';
import { initAudioUnlock, playNotificationChord } from './utils/notificationSound';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import PersonalizationPage from './pages/PersonalizationPage';
import SettingsPage from './pages/SettingsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import RemindersPage from './pages/RemindersPage';
import PWAInstallGuideModal from './components/pwa/PWAInstallGuideModal';
import ConnectGoogleDriveModal from './components/drive/ConnectGoogleDriveModal';
import { Loader2 } from 'lucide-react';
import './App.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function HomeRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex-center-screen">
        <div className="loading-spinner-wrapper">
          <Loader2 className="spinner-icon animate-spin" size={36} />
          <p>Loading Personal AI...</p>
        </div>
      </div>
    );
  }
  return isAuthenticated ? <Navigate to="/chat" replace /> : <LoginPage />;
}

function AppLayout() {
  const location = useLocation();
  const { isDriveModalOpen, closeDriveModal } = useAuth();
  const isChatRoute = location.pathname.startsWith('/chat');
  const isAuthAppRoute =
    location.pathname.startsWith('/chat') ||
    location.pathname === '/personalization' ||
    location.pathname === '/profile' ||
    location.pathname === '/settings' ||
    location.pathname === '/plugins' ||
    location.pathname === '/integrations' ||
    location.pathname === '/reminders';
  const isLandingRoute =
    location.pathname === '/' ||
    location.pathname === '/login' ||
    location.pathname === '/auth/callback';

  return (
    <div className={`app-layout ${isChatRoute ? 'app-chat-mode' : 'app-scrollable-mode'}`}>
      {!isAuthAppRoute && !isLandingRoute && <Navbar />}
      <main className={`app-main-content ${isChatRoute ? 'app-chat-main' : 'app-scrollable-main'}`}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:conversationId"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personalization"
            element={
              <ProtectedRoute>
                <PersonalizationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/plugins"
            element={
              <ProtectedRoute>
                <IntegrationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/integrations"
            element={
              <ProtectedRoute>
                <IntegrationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reminders"
            element={
              <ProtectedRoute>
                <RemindersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <PWAInstallGuideModal />
      <ConnectGoogleDriveModal isOpen={isDriveModalOpen} onClose={closeDriveModal} />
    </div>
  );
}

function App() {
  useEffect(() => {
    initAudioUnlock();

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const handleSwMessage = (event) => {
        if (event.data?.type === 'PLAY_NOTIFICATION_CHORD') {
          playNotificationChord();
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
    return undefined;
  }, []);

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <PWAInstallProvider>
              <BrowserRouter>
                <AppLayout />
              </BrowserRouter>
            </PWAInstallProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
