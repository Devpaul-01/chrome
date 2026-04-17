/**
 * context/AppContext.tsx — Global shared state for the popup React tree.
 *
 * Provides:
 *   - `user` / `setUser`          — authenticated `UserProfile` or null
 *   - `isInitializing`            — true while the auth-check is in flight
 *   - `viewMode` / `setViewMode`  — current sub-view (main, schedules, etc.)
 *   - `activeTab` / `setActiveTab`— bottom-nav tab selection
 *   - `showToast(msg, type?)`      — imperative toast notification helper
 *   - `handleLogout()`            — clears auth and resets view state
 *
 * WebSocket connection lifecycle is managed here so it is tied to the auth
 * state: the WS connects after login and disconnects on logout.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserProfile } from '../../api/client';
import { sendBackgroundMessage } from '../api';
import { logError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { announceToScreenReader } from '../../utils/accessibility';
import { getTokens } from '../../utils/storage';
import wsClient from '../../api/websocket';
import Toast, { type ToastType } from '../components/Toast';

// ---- shared type aliases -----------------------------------------------
export type AuthMode = 'login' | 'register' | 'forgot-password' | 'verify-email-pending';
export type TabType = 'home' | 'messages' | 'scheduling' | 'analytics' | 'account';
// Future: re-enable contacts tab
// export type TabType = 'home' | 'messages' | 'contacts' | 'account';
export type ViewMode =
  | 'main'
  | 'change-password'
  | 'schedules'
  | 'scheduling'
  | 'automation'
  | 'message-templates'
  | 'queue'
  | 'history'
  | 'analytics'
  | 'upcoming-birthdays'
  | 'posts'
  | 'postLibrary'
  | 'images'
  | 'smtp-settings'
  | 'account-management'
  | 'subscription'
  | 'template-gallery'
  | 'message-groups'
  // Contact view modes — kept for type-safety of restored UI files.
  // Contact UI is currently disabled; contacts are populated via scraping.
  | 'contacts'
  | 'add-contact'
  | 'edit-contact'
  | 'import-contacts'
  | 'birthday-calendar';

// ---- context shape -----------------------------------------------------
interface AppContextValue {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  isInitializing: boolean;
  refreshUser: () => Promise<void>;
  handleLogout: () => Promise<void>;
  showToast: (message: string, type: ToastType) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within <AppProvider>');
  return ctx;
}

// ---- provider ----------------------------------------------------------
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [activeTab, setActiveTab] = useState<TabType>('home');

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    announceToScreenReader(message, type === 'error' ? 'assertive' : 'polite');
  }, []);

  const connectWebSocket = useCallback(async () => {
    if (wsClient.isConnected()) return;
    try {
      const wsConfig = await sendBackgroundMessage<{ wsUrl: string; token: string }>({
        type: 'config.getWSConfig',
      });
      wsClient.connect({
        url: wsConfig.wsUrl,
        token: wsConfig.token,
        onConnect: () => logger.log('[App] WebSocket connected'),
        onDisconnect: () => logger.log('[App] WebSocket disconnected'),
        onError: (error) => logError(error, 'WebSocket'),
      });
    } catch (wsError) {
      // Non-critical: app works without real-time updates
      logError(wsError, 'connectWebSocket');
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      // Check storage directly (no background round-trip needed) before
      // attempting auth.me. This avoids a 10-30 s wait when the backend is
      // unreachable and the service worker has to be woken up just to return
      // a 401 / network error.
      const tokens = await getTokens();
      if (!tokens.accessToken && !tokens.refreshToken) {
        setUser(null);
        return;
      }
      const profile = await sendBackgroundMessage<UserProfile>({ type: 'auth.me' });
      setUser(profile);
      await connectWebSocket();
    } catch (error) {
      logError(error, 'refreshUser');
      setUser(null);
    }
  }, [connectWebSocket]);

  const handleLogout = useCallback(async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    try {
      await sendBackgroundMessage<void>({ type: 'auth.logout' });
      wsClient.disconnect();
      setUser(null);
      showToast('Logged out successfully', 'info');
    } catch (error) {
      logError(error, 'handleLogout');
      showToast((error as Error).message ?? 'Logout failed', 'error');
    }
  }, [showToast]);

  // Initialise once on mount
  useEffect(() => {
    setIsInitializing(true);
    refreshUser().finally(() => setIsInitializing(false));
  }, [refreshUser]);

  // Global keyboard shortcuts
  useEffect(() => {
    const isAuthenticated = Boolean(user);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey && event.key === 'l' && isAuthenticated) {
        event.preventDefault();
        void handleLogout();
      }
      if (event.altKey && event.key === 'h' && isAuthenticated && viewMode !== 'main') {
        event.preventDefault();
        setViewMode('main');
        setActiveTab('home');
        announceToScreenReader('Navigated to main view');
      }
      if (event.altKey && event.key === 'd' && isAuthenticated) {
        event.preventDefault();
        setViewMode('analytics');
        setActiveTab('messages');
        announceToScreenReader('Navigated to Dashboard');
      }
      if (event.key === 'Escape' && viewMode !== 'main' && isAuthenticated) {
        event.preventDefault();
        setViewMode('main');
        announceToScreenReader('Returned to main view');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, viewMode, handleLogout]);

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        isInitializing,
        refreshUser,
        handleLogout,
        showToast,
        viewMode,
        setViewMode,
        activeTab,
        setActiveTab,
      }}
    >
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {children}
    </AppContext.Provider>
  );
}
