import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import AuthForm from './components/AuthForm';
import TemplateCreator, { type TemplateFormData } from './components/TemplateCreator';
import SubscriptionPanel from './components/SubscriptionPanel';
import ForgotPassword from './components/ForgotPassword';
import ChangePassword from './components/ChangePassword';
import SchedulingSettings from './components/SchedulingSettings';
import MessageQueue from './components/MessageQueue';
import MessageHistory from './components/MessageHistory';
import Dashboard from './components/Dashboard';
import PostEditor from './components/PostEditor';
import PostList from './components/PostList';
import MessageGroups from './components/MessageGroups';
import ImageManager from './components/ImageManager';
import ContactList from './components/ContactList';
import ContactForm from './components/ContactForm';
import ImportContactsModal from './components/ImportContactsModal';
import BirthdayCalendar from './components/BirthdayCalendar';
import SMTPSettings from './components/SMTPSettings';
import AccountManagement from './components/AccountManagement';
import Spinner from './components/Spinner';
import ErrorBoundary from './components/ErrorBoundary';
import './popup.css';

import type { UserProfile } from '../api/client';
import { sendBackgroundMessage } from './api';
import { getErrorMessage, logError } from '../utils/errors';
import wsClient from '../api/websocket';

import { AppProvider, useAppContext, type AuthMode, type TabType } from './context/AppContext';
import { useContacts } from './hooks/useContacts';
import { useSMTPConfig } from './hooks/useSMTPConfig';
import { useMessageTemplates } from './hooks/useMessageTemplates';
import { usePostComposer } from './hooks/usePostComposer';

// ---- Root component: just the provider + error boundary -----------------
export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
}

// ---- Shell: consumes context + all domain hooks -------------------------
function AppShell() {
  const {
    user,
    setUser,
    isInitializing,
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    showToast,
    handleLogout,
    refreshUser,
  } = useAppContext();

  const contactsHook = useContacts();
  const smtpHook = useSMTPConfig();
  const msgTemplates = useMessageTemplates();
  const post = usePostComposer();

  // ---- Auth local state (only needed while unauthenticated) ----------
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  async function handleAuthSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsAuthSubmitting(true);
    setAuthMessage(null);
    try {
      await sendBackgroundMessage<{ access_token: string }>({
        type: authMode === 'login' ? 'auth.login' : 'auth.register',
        payload: { email, password },
      });
      await refreshUser();
      setEmail('');
      setPassword('');
      showToast(
        authMode === 'login' ? 'Welcome back!' : 'Account created successfully!',
        'success',
      );
    } catch (error) {
      const msg = getErrorMessage(error);
      logError(error, `handleAuthSubmit:${authMode}`);
      setAuthMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  // ---- Account management (mutates user in context) ------------------
  const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const handleUpdateProfile = useCallback(
    async (profile: Partial<UserProfile>): Promise<void> => {
      setIsAccountSubmitting(true);
      setAccountMessage(null);
      try {
        const updated = await sendBackgroundMessage<UserProfile>({
          type: 'auth.updateProfile',
          payload: profile,
        });
        setUser(updated);
        showToast('Profile updated successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleUpdateProfile');
        setAccountMessage(msg);
        showToast(msg, 'error');
        throw error;
      } finally {
        setIsAccountSubmitting(false);
      }
    },
    [setUser, showToast],
  );

  const handleUpdateTimezone = useCallback(
    async (timezone: string): Promise<void> => {
      setIsAccountSubmitting(true);
      setAccountMessage(null);
      try {
        const updated = await sendBackgroundMessage<UserProfile>({
          type: 'auth.updateProfile',
          payload: { timezone },
        });
        setUser(updated);
        showToast('Timezone updated successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleUpdateTimezone');
        setAccountMessage(msg);
        showToast(msg, 'error');
        throw error;
      } finally {
        setIsAccountSubmitting(false);
      }
    },
    [setUser, showToast],
  );

  const handleDeleteAccount = useCallback(async (): Promise<void> => {
    setIsAccountSubmitting(true);
    try {
      await sendBackgroundMessage<{ message: string }>({ type: 'auth.deleteAccount' });
      wsClient.disconnect();
      setUser(null); // triggers all hooks to clear their state via useEffect([user])
      showToast('Account deleted successfully', 'info');
    } catch (error) {
      const msg = getErrorMessage(error);
      logError(error, 'handleDeleteAccount');
      showToast(msg, 'error');
      throw error;
    } finally {
      setIsAccountSubmitting(false);
    }
  }, [setUser, showToast]);

  const isAuthenticated = Boolean(user);

  // ---- Tab navigation ------------------------------------------------
  const [openDropdown, setOpenDropdown] = useState<TabType | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close dropdown when clicking outside the nav
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderTabNavigation = () => {
    const tabs: {
      id: TabType;
      label: string;
      menuItems?: { label: string; action: () => void }[];
    }[] = [
      { id: 'home', label: 'Home' },
      {
        id: 'contacts',
        label: 'Contacts',
        menuItems: [
          { label: 'Manage Contacts', action: () => setActiveTab('contacts') },
          { label: 'Birthday Calendar', action: () => setViewMode('birthday-calendar') },
        ],
      },
      {
        id: 'messages',
        label: 'Messages',
        menuItems: [
          {
            label: 'Message Templates',
            action: () => { setActiveTab('messages'); setViewMode('message-templates'); },
          },
          { label: 'Timeline Posts', action: () => setViewMode('posts') },
          { label: 'Scheduling', action: () => setViewMode('scheduling') },
          { label: 'Analytics', action: () => setViewMode('analytics') },
          { label: 'Image Library', action: () => setViewMode('images') },
        ],
      },
      {
        id: 'account',
        label: 'Account',
        menuItems: [
          { label: 'Profile', action: () => setViewMode('account-management') },
          { label: 'Change Password', action: () => setViewMode('change-password') },
          { label: 'SMTP Settings', action: () => setViewMode('smtp-settings') },
          { label: 'Subscription', action: () => setViewMode('subscription') },
          { label: 'Sign Out', action: () => void handleLogout() },
        ],
      },
    ];

    return (
      <nav ref={navRef} className="tab-navigation mb-4" role="tablist">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <div key={tab.id} className="tab-wrapper">
              <button
                id={`${tab.id}-tab`}
                role="tab"
                aria-selected={activeTab === tab.id ? 'true' : 'false'}
                aria-controls={`${tab.id}-panel`}
                aria-haspopup={tab.menuItems ? 'true' : undefined}
                aria-expanded={openDropdown === tab.id ? 'true' : 'false'}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setViewMode('main');
                  // Toggle dropdown for tabs with menu items; close for others
                  setOpenDropdown((prev) =>
                    tab.menuItems ? (prev === tab.id ? null : tab.id) : null,
                  );
                }}
              >
                {tab.label}
              </button>
              {tab.menuItems && openDropdown === tab.id && (
                <div className="tab-dropdown tab-dropdown-open">
                  {tab.menuItems.map((item, i) => (
                    <button
                      key={i}
                      className="tab-dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        item.action();
                        setOpenDropdown(null);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>
    );
  };

  // ---- View routing --------------------------------------------------
  const renderView = () => {
    if (viewMode === 'change-password') {
      return <ChangePassword onCancel={() => setViewMode('main')} onSuccess={() => setViewMode('main')} />;
    }
    if (viewMode === 'scheduling') {
      return <SchedulingSettings onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'queue') {
      return <MessageQueue onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'history') {
      return <MessageHistory onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'analytics') {
      return <Dashboard onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'message-templates') {
      const { editingTemplate } = msgTemplates;
      return (
        <div className="view-container">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-blueStrong">Message Templates</h2>
            <div />
          </div>
          <div className="mb-6">
            <div className="card mb-4">
              <TemplateCreator
                onSubmit={
                  editingTemplate
                    ? (data: TemplateFormData) =>
                        msgTemplates.handleUpdateMessageTemplate(editingTemplate.id, data)
                    : msgTemplates.handleCreateTemplate
                }
                onCancel={() => setViewMode('main')}
                initialData={
                  editingTemplate
                    ? {
                        greeting: editingTemplate.greeting,
                        sentiment: editingTemplate.sentiment,
                        closing: editingTemplate.closing,
                        imageUrl: editingTemplate.imageUrl || null,
                        templateTitle: editingTemplate.templateTitle,
                        daysInAdvance: editingTemplate.daysInAdvance,
                        gender: editingTemplate.gender,
                      }
                    : undefined
                }
              />
            </div>
            <div className="mb-6">
              <MessageGroups onClose={() => setViewMode('main')} showClose={false} />
            </div>
          </div>
        </div>
      );
    }
    if (viewMode === 'posts') {
      return (
        <div>
          <h2 className="text-lg font-bold text-blueStrong mb-3">Timeline Posts</h2>
          <p className="text-xs text-gray-600 mb-4">
            Create and manage your timeline post templates in one place.
          </p>
          <PostEditor
            postForm={post.postForm}
            setPostForm={post.setPostForm}
            onSubmit={post.handlePostSubmit}
            isSubmitting={post.isSubmitting}
            message={null}
          />
          <div className="mt-4">
            <PostList onClose={() => setViewMode('main')} showClose={false} />
          </div>
        </div>
      );
    }
    if (viewMode === 'groups') {
      return <MessageGroups onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'images') {
      return <ImageManager onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'contacts') {
      return (
        <ContactList
          contacts={contactsHook.contacts}
          onAddContact={() => setViewMode('add-contact')}
          onImportContacts={() => contactsHook.setShowImportModal(true)}
          onEditContact={(contact) => {
            contactsHook.setEditingContact(contact);
            setViewMode('edit-contact');
          }}
          onDeleteContact={contactsHook.handleDeleteContact}
        />
      );
    }
    if (viewMode === 'add-contact') {
      return (
        <ContactForm
          onSubmit={contactsHook.handleAddContact}
          onCancel={() => setViewMode('contacts')}
          isSubmitting={contactsHook.isSubmitting}
          message={contactsHook.message}
        />
      );
    }
    if (viewMode === 'edit-contact' && contactsHook.editingContact) {
      return (
        <ContactForm
          contact={contactsHook.editingContact}
          onSubmit={contactsHook.handleUpdateContact}
          onCancel={() => {
            contactsHook.setEditingContact(null);
            setViewMode('contacts');
          }}
          isSubmitting={contactsHook.isSubmitting}
          message={contactsHook.message}
        />
      );
    }
    if (viewMode === 'birthday-calendar') {
      return (
        <BirthdayCalendar
          contacts={contactsHook.contacts}
          onBack={() => setViewMode('contacts')}
        />
      );
    }
    if (viewMode === 'smtp-settings') {
      return (
        <SMTPSettings
          config={smtpHook.smtpConfig || undefined}
          onSave={smtpHook.handleSaveSMTPConfig}
          isSubmitting={smtpHook.isSubmitting}
          message={smtpHook.message}
        />
      );
    }
    if (viewMode === 'account-management' && user) {
      return (
        <AccountManagement
          // AccountManagement defines its own UserProfile type; cast is intentional
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          user={user as any}
          onUpdateProfile={handleUpdateProfile as Parameters<typeof AccountManagement>[0]['onUpdateProfile']}
          onUpdateTimezone={handleUpdateTimezone}
          onDeleteAccount={handleDeleteAccount}
          onLogout={handleLogout}
          isSubmitting={isAccountSubmitting}
          message={accountMessage}
        />
      );
    }
    if (viewMode === 'subscription') {
      return <SubscriptionPanel />;
    }

    // ---- Tab home views ----
    switch (activeTab) {
      case 'home':
        return (
          <div role="tabpanel" id="home-panel" className="tab-content">
            <div className="card text-center mb-6">
              <h2 className="text-2xl font-bold text-blueStrong mb-3">
                Welcome, {user?.email?.split('@')[0] || 'User'}!
              </h2>
              <p className="text-textMuted text-sm">
                Manage your birthday messages and social posts all in one place
              </p>
            </div>
            <div className="h-4" />
            <div className="card mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blueStrong">
                    {contactsHook.contacts.length}
                  </div>
                  <div className="text-xs text-textMuted">Contacts</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blueStrong">
                    {contactsHook.contacts.length}
                  </div>
                  <div className="text-xs text-textMuted">Birthdays</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blueStrong">0</div>
                  <div className="text-xs text-textMuted">Scheduled</div>
                </div>
              </div>
            </div>
            <div className="h-4" />
            <div className="card mb-6">
              <h3 className="text-lg font-semibold text-blueStrong mb-4">Upcoming Birthdays</h3>
              <div className="bg-surfaceSection rounded-lg p-4 text-center text-textMuted">
                {contactsHook.contacts.length === 0
                  ? 'No upcoming birthdays. Add contacts to get started!'
                  : 'No upcoming birthdays.'}
              </div>
              <button
                onClick={() => setViewMode('birthday-calendar')}
                className="btn-outline-orange w-full mt-4"
              >
                View Calendar
              </button>
            </div>
            <div className="h-4" />
            <div className="card mb-6 bg-surfaceSection">
              <h4 className="font-semibold text-orangeStrong mb-1">Quick Tip</h4>
              <p className="text-sm text-textMuted">
                Set up your contacts first to easily send personalized birthday messages
              </p>
            </div>
            <div className="h-6" />
            <button
              onClick={() => setViewMode('analytics')}
              className="btn-primary btn-block mb-3"
            >
              View Analytics
            </button>
          </div>
        );

      case 'contacts':
        return (
          <div role="tabpanel" id="contacts-panel" className="tab-content">
            <ContactList
              contacts={contactsHook.contacts}
              onAddContact={() => setViewMode('add-contact')}
              onImportContacts={() => contactsHook.setShowImportModal(true)}
              onEditContact={(contact) => {
                contactsHook.setEditingContact(contact);
                setViewMode('edit-contact');
              }}
              onDeleteContact={contactsHook.handleDeleteContact}
            />
          </div>
        );

      case 'messages':
        return (
          <div role="tabpanel" id="messages-panel" className="tab-content">
            {msgTemplates.showTemplateCreator && (
              <TemplateCreator
                onSubmit={
                  msgTemplates.editingTemplate
                    ? (data: TemplateFormData) =>
                        msgTemplates.handleUpdateMessageTemplate(
                          msgTemplates.editingTemplate!.id,
                          data,
                        )
                    : msgTemplates.handleCreateTemplate
                }
                onCancel={() => {
                  msgTemplates.setShowTemplateCreator(false);
                  msgTemplates.setEditingTemplate(null);
                }}
                initialData={
                  msgTemplates.editingTemplate
                    ? {
                        greeting: msgTemplates.editingTemplate.greeting,
                        sentiment: msgTemplates.editingTemplate.sentiment,
                        closing: msgTemplates.editingTemplate.closing,
                        imageUrl: msgTemplates.editingTemplate.imageUrl || null,
                        templateTitle: msgTemplates.editingTemplate.templateTitle,
                        daysInAdvance: msgTemplates.editingTemplate.daysInAdvance,
                        gender: msgTemplates.editingTemplate.gender,
                      }
                    : undefined
                }
              />
            )}
          </div>
        );

      case 'account':
        return (
          <div role="tabpanel" id="account-panel" className="tab-content">
            <div className="card mb-6">
              <h2 className="text-lg font-semibold mb-4">Account Information</h2>
              <p className="text-textMuted text-sm mb-2">
                Logged in as <strong className="text-textPrimary">{user?.email}</strong>
              </p>
            </div>
            <div className="h-4" />
            <div className="card mb-6">
              <h3 className="text-md font-semibold mb-4">Account Settings</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setViewMode('change-password')}
                  className="btn-secondary btn-block"
                  disabled={isAccountSubmitting}
                >
                  Change Password
                </button>
                <button
                  onClick={() => void handleLogout()}
                  className="btn-primary btn-block"
                  disabled={isAccountSubmitting}
                >
                  {isAccountSubmitting ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
            <SubscriptionPanel />
          </div>
        );

      default:
        return null;
    }
  };

  // ---- Render --------------------------------------------------------
  return (
    <div className="popup-root" role="application" aria-label="Birthday Messaging Extension">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header role="banner">
        <img
          src="./images/Birthday_messaging-logo.png"
          alt="Birthday Messaging Logo"
          className="app-logo block mx-auto mb-2"
        />
        <h1 className="app-title hidden">BirthdayMessaging</h1>
      </header>

      {isInitializing && (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Spinner size="lg" message="Initializing..." />
        </div>
      )}

      <main id="main-content" role="main">
        {!isInitializing && !isAuthenticated && (
          <>
            {authMode === 'forgot-password' ? (
              <ForgotPassword
                onBack={() => setAuthMode('login')}
                onRequestSent={() => setAuthMode('login')}
              />
            ) : (
              <AuthForm
                authMode={authMode}
                setAuthMode={setAuthMode}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                isSubmitting={isAuthSubmitting}
                onSubmit={handleAuthSubmit}
                message={authMessage}
              />
            )}
          </>
        )}

        {!isInitializing && isAuthenticated && (
          <>
            {renderTabNavigation()}
            <section
              role="tabpanel"
              id={`${activeTab}-panel`}
              aria-labelledby={`${activeTab}-tab`}
              tabIndex={-1}
            >
              {renderView()}
            </section>
          </>
        )}
      </main>

      {isAuthenticated && (
        <footer role="contentinfo" className="mt-2">
          <details className="card text-xs">
            <summary className="cursor-pointer font-semibold text-textPrimary hover:text-blueStrong">
              Keyboard Shortcuts
            </summary>
            <ul className="mt-2 space-y-1 text-gray-600">
              <li><kbd className="px-1 py-0.5 bg-gray-200 rounded">Alt+H</kbd> - Home</li>
              <li><kbd className="px-1 py-0.5 bg-gray-200 rounded">Alt+D</kbd> - Dashboard</li>
              <li><kbd className="px-1 py-0.5 bg-gray-200 rounded">Alt+L</kbd> - Logout</li>
              <li><kbd className="px-1 py-0.5 bg-gray-200 rounded">Esc</kbd> - Close modal</li>
            </ul>
          </details>
        </footer>
      )}

      {contactsHook.showImportModal && (
        <ImportContactsModal
          onClose={() => contactsHook.setShowImportModal(false)}
          onImport={contactsHook.handleImportContacts}
        />
      )}

      {msgTemplates.showTemplateCreator && viewMode !== 'message-templates' && (
        <div className="modal-overlay">
          <div role="dialog" aria-modal="true" aria-label="Edit message template">
            <TemplateCreator
            onSubmit={
              msgTemplates.editingTemplate
                ? (data: TemplateFormData) =>
                    msgTemplates.handleUpdateMessageTemplate(msgTemplates.editingTemplate!.id, data)
                : msgTemplates.handleCreateTemplate
            }
            onCancel={() => {
              msgTemplates.setShowTemplateCreator(false);
              msgTemplates.setEditingTemplate(null);
            }}
            initialData={
              msgTemplates.editingTemplate
                ? {
                    greeting: msgTemplates.editingTemplate.greeting,
                    sentiment: msgTemplates.editingTemplate.sentiment,
                    closing: msgTemplates.editingTemplate.closing,
                    imageUrl: msgTemplates.editingTemplate.imageUrl || null,
                    templateTitle: msgTemplates.editingTemplate.templateTitle,
                    daysInAdvance: msgTemplates.editingTemplate.daysInAdvance,
                    gender: msgTemplates.editingTemplate.gender,
                  }
                : undefined
            }
          />
          </div>
        </div>
      )}
    </div>
  );
}

