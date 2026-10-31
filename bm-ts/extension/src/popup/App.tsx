/// <reference types="chrome" />
/**
 * popup/App.tsx — Root React component for the extension popup.
 *
 * Component tree:
 *   App
 *   └─ ErrorBoundary       (catches unhandled render errors)
 *      └─ AppProvider        (shared auth / toast / tab context via AppContext)
 *         └─ AppShell          (consumes context + all domain hooks; renders tabs)
 *
 * `AppShell` is deliberately extracted from `App` so that hooks that call
 * `useAppContext()` can be used inside the provider boundary.
 *
 * Navigation is state-driven (`viewMode` / `activeTab`): there are no routes.
 * All backend communication goes through `sendBackgroundMessage` which proxies
 * calls to the background service worker.
 */

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthForm from './components/AuthForm';
import ResendVerificationEmailButton from './components/ResendVerificationEmailButton';
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
import ImageManager from './components/ImageManager';
// import SMTPSettings from './components/SMTPSettings'; // Uncomment when SMTP/multi-platform support is added
// Contacts UI — read-only list re-enabled; add/import/edit remain disabled.
import ContactList from './components/ContactList';
import ContactForm from './components/ContactForm';
// import ImportContactsModal from './components/ImportContactsModal';
// import BirthdayCalendar from './components/BirthdayCalendar';
import UpcomingBirthdays from './components/UpcomingBirthdays';
import MessagesHub from './components/MessagesHub';
import MessageGroups from './components/MessageGroups';
import HomeControls from './components/HomeControls';
import AccountManagement from './components/AccountManagement';
import TemplateGallery from './components/TemplateGallery';
import OnboardingWizard from './components/OnboardingWizard';
import HelpPanel from './components/HelpPanel';
import HelpTooltip from './components/HelpTooltip';
import Spinner from './components/Spinner';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import './popup.css';

import type { UserProfile } from '../api/client';
import { sendBackgroundMessage } from './api';
// For sending messages to content scripts
function sendShowOverlayToFacebookTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  // Query all Facebook tabs across all windows — `currentWindow: true` would
  // refer to the extension popup window (which has no browseable tabs) and
  // would always return an empty array when called from a popup.
  chrome.tabs.query({ url: '*://*.facebook.com/*' }, (tabs: chrome.tabs.Tab[]) => {
    // Prefer the active Facebook tab; fall back to the first available one.
    const activeTab = tabs.find((t) => t.active);
    const tab = activeTab ?? tabs[0];
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'show.overlay' }, () => {
        if (chrome.runtime.lastError) {
          alert(
            'Could not connect to the Facebook tab. Please refresh the Facebook page and try again.',
          );
        }
      });
    } else {
      alert('Please open Facebook in a tab and try again.');
    }
  });
}
import { getErrorMessage, logError } from '../utils/errors';
import { getOnboardingComplete, setOnboardingComplete } from '../utils/storage';
import wsClient from '../api/websocket';

import { AppProvider, useAppContext, type AuthMode, type TabType } from './context/AppContext';
import { useMessageTemplates } from './hooks/useMessageTemplates';
import { usePostComposer } from './hooks/usePostComposer';
import { useContacts } from './hooks/useContacts';

// ---- Read-only contacts page wrapper ------------------------------------
type ContactsPageProps = {
  onClose: () => void;
  onEditContact: (contact: import('../api/client').Contact) => void;
  onDeleteContact: (id: string) => void;
  contacts: import('../api/client').Contact[];
  isLoading: boolean;
};

function ContactsPage({
  onClose,
  onEditContact,
  onDeleteContact,
  contacts,
  isLoading,
}: ContactsPageProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="md" message="Loading contacts..." />
      </div>
    );
  }

  return (
    <ContactList
      contacts={contacts}
      onClose={onClose}
      onEditContact={onEditContact}
      onDeleteContact={onDeleteContact}
    />
  );
}

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

  // Production feature access is always determined by the backend, never by login alone.
  const [entitlement, setEntitlement] = useState<'checking' | 'active' | 'inactive'>('checking');
  const msgTemplates = useMessageTemplates(entitlement === 'active');
  const contactsHook = useContacts(entitlement === 'active');
  const refreshEntitlement = useCallback(async () => {
    setEntitlement('checking');
    try {
      const status = await sendBackgroundMessage<{ is_active: boolean }>({ type: 'subscription.status' });
      setEntitlement(status?.is_active === true ? 'active' : 'inactive');
    } catch {
      setEntitlement('inactive'); // Fail closed if status cannot be verified.
    }
  }, []);
  useEffect(() => {
    if (!user) { setEntitlement('checking'); return; }
    void refreshEntitlement();
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshEntitlement(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, refreshEntitlement]);


  const post = usePostComposer();


  // ---- Onboarding wizard --------------------------------------------------
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  useEffect(() => {
    if (user) {
      getOnboardingComplete().then((done) => {
        if (!done) setShowOnboarding(true);
      });
    }
  }, [user]);

  function handleOnboardingDismiss() {
    setOnboardingComplete(true);
    setShowOnboarding(false);
  }

  function handleRestartTour() {
    setOnboardingComplete(false);
    setShowOnboarding(true);
  }

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
      await sendBackgroundMessage<{ message: string }>(
        authMode === 'login'
          ? { type: 'auth.login', payload: { email, password } }
          : { type: 'auth.register', payload: { email, password } },
      );
      if (authMode === 'register') {
        setPassword('');
        setAuthMode('verify-email-pending');
      } else {
        await refreshUser();
        setEmail('');
        setPassword('');
        showToast('Welcome back!', 'success');
      }
    } catch (error) {
      const msg = getErrorMessage(error);
      logError(error, `handleAuthSubmit:${authMode}`);
      // If login failed due to unverified email, show the resend verification UI
      if (
        authMode === 'login' &&
        (msg.toLowerCase().includes('verify your email') ||
          msg.toLowerCase().includes('check your inbox'))
      ) {
        setAuthMode('verify-email-pending');
        setAuthMessage(null); // Message will be shown in the verify-email-pending view
        // Do not clear email so the resend button works
      } else {
        setAuthMessage(msg);
        showToast(msg, 'error');
      }
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  // ---- Account management (mutates user in context) ------------------
  const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const accountTimezone = useMemo(
    () =>
      (user as { timezone?: string } | null)?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    [user],
  );
  const [showAccountDeleteConfirm, setShowAccountDeleteConfirm] = useState(false);

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
      showToast('Account successfully deleted', 'success');
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
  const navRef = useRef<HTMLElement>(null);

  const renderTabNavigation = () => {
    const tabs: {
      id: TabType;
      label: string;
      icon: React.ReactNode;
    }[] = [
      {
        id: 'home',
        label: 'Home',
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
      {
        id: 'messages',
        label: 'Create',
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="10" y1="10" x2="14" y2="10" />
          </svg>
        ),
      },
      {
        id: 'scheduling',
        label: 'Automate',
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
      // { id: 'contacts', label: 'Contacts', icon: null }, // Uncomment to re-enable contacts tab
      {
        id: 'account',
        label: 'Account',
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ),
      },
    ];

    function handleTabKeyDown(e: React.KeyboardEvent, tabIndex: number) {
      const tabButtons = navRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      if (!tabButtons) return;

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          const next = (tabIndex + 1) % tabButtons.length;
          tabButtons[next].focus();
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const prev = (tabIndex - 1 + tabButtons.length) % tabButtons.length;
          tabButtons[prev].focus();
          break;
        }
        case 'Home': {
          e.preventDefault();
          tabButtons[0].focus();
          break;
        }
        case 'End': {
          e.preventDefault();
          tabButtons[tabButtons.length - 1].focus();
          break;
        }
      }
    }

    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
      <nav ref={navRef} className="tab-navigation mb-4" role="tablist" aria-label="Main navigation">
        <div className="flex gap-2">
          {tabs.map((tab, tabIndex) => (
            <div key={tab.id} className="tab-wrapper">
              <button
                id={`${tab.id}-tab`}
                role="tab"
                ref={(el) => {
                  if (el) el.setAttribute('aria-selected', String(activeTab === tab.id));
                }}
                aria-controls={`${tab.id}-panel`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setViewMode('main');
                }}
                onKeyDown={(e) => handleTabKeyDown(e, tabIndex)}
              >
                <span className="tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            </div>
          ))}
        </div>
      </nav>
    );
  };

  // ---- View routing --------------------------------------------------
  const renderView = () => {
    if (viewMode === 'change-password') {
      return (
        <ChangePassword
          onCancel={() => setViewMode('main')}
          onSuccess={() => setViewMode('main')}
        />
      );
    }
    if (viewMode === 'queue') {
      return <MessageQueue onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'history') {
      return <MessageHistory onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'analytics') {
      return (
        <div>
          <Dashboard onClose={() => setViewMode('main')} />
          <button
            className="btn"
            onClick={() => {
              setActiveTab('home');
              setViewMode('main');
            }}
          >
            ← Back to Home
          </button>
        </div>
      );
    }
    if (viewMode === 'upcoming-birthdays') {
      return (
        <UpcomingBirthdays
          onClose={() => {
            setActiveTab('home');
            setViewMode('main');
          }}
        />
      );
    }
    if (viewMode === 'template-gallery') {
      return (
        <div className="view-container">
          <TemplateGallery
            templates={msgTemplates.messageTemplates}
            onEdit={(template) => {
              msgTemplates.setEditingTemplate(template);
              setViewMode('message-templates');
            }}
            onDelete={msgTemplates.handleDeleteMessageTemplate}
            onCreate={() => {
              msgTemplates.setEditingTemplate(null);
              setViewMode('message-templates');
            }}
          />
          <button className="btn" onClick={() => setViewMode('message-templates')}>
            ← Back to Message Templates
          </button>
        </div>
      );
    }
    if (viewMode === 'message-templates') {
      const { editingTemplate } = msgTemplates;
      return (
        <div className="view-container">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-blueStrong">
              Message Templates{' '}
              <HelpTooltip label="Create personalised birthday message templates sent as private Facebook messages. Tip: create at least 3 templates per group — the extension randomises which one is sent, keeping messages varied and reducing the risk of Facebook flagging repetitive content." />
            </h2>
            <div />
          </div>
          <p className="text-xs text-gray-600 mb-3">
            Write and manage your birthday message templates.
          </p>
          <div className="mb-3">
            <div className="mb-2">
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
                        groupId: editingTemplate.groupId,
                      }
                    : undefined
                }
              />
            </div>
            <button className="btn-orange w-full" onClick={() => setViewMode('template-gallery')}>
              View/Edit Message Templates
            </button>
          </div>
          <button
            className="btn"
            onClick={() => {
              setActiveTab('messages');
              setViewMode('main');
            }}
          >
            ← Back to Templates
          </button>
        </div>
      );
    }
    if (viewMode === 'posts') {
      return (
        <div>
          <h2 className="text-lg font-bold text-blueStrong mb-3">
            {post.editingPostId ? 'Edit Timeline Post' : 'Create Timeline Post'}
          </h2>
          <p className="text-xs text-gray-600 mb-2">
            Design a birthday post to be sent to friends&apos; timelines on their special day.
          </p>
          <PostEditor
            postForm={post.postForm}
            setPostForm={post.setPostForm}
            onSubmit={post.handlePostSubmit}
            isSubmitting={post.isSubmitting}
            isEditing={!!post.editingPostId}
            onCancelEdit={() => {
              post.cancelEditing();
            }}
            message={null}
            onViewPosts={() => setViewMode('postLibrary')}
          />
          <button
            className="btn"
            onClick={() => {
              post.cancelEditing();
              setActiveTab('messages');
              setViewMode('main');
            }}
          >
            ← Back to Create
          </button>
        </div>
      );
    }
    if (viewMode === 'postLibrary') {
      return (
        <div>
          <PostList
            onClose={() => setViewMode('posts')}
            onEdit={(p) => {
              post.startEditing(p);
              setViewMode('posts');
            }}
          />
        </div>
      );
    }
    if (viewMode === 'images') {
      return (
        <div>
          <ImageManager onClose={() => setViewMode('main')} />
          <button
            className="btn"
            onClick={() => {
              setActiveTab('messages');
              setViewMode('main');
            }}
          >
            ← Back to Templates
          </button>
        </div>
      );
    }
    if (viewMode === 'message-groups') {
      return (
        <MessageGroups
          onClose={() => {
            setActiveTab('messages');
            setViewMode('main');
          }}
        />
      );
    }
    if (viewMode === 'contacts') {
      return (
        <ContactsPage
          contacts={contactsHook.contacts}
          isLoading={false}
          onClose={() => {
            setActiveTab('home');
            setViewMode('main');
          }}
          onEditContact={(contact) => {
            contactsHook.setEditingContact(contact);
            setViewMode('edit-contact');
          }}
          onDeleteContact={contactsHook.handleDeleteContact}
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
    // SMTP settings view — commented out until multi-platform support is added
    // if (viewMode === 'smtp-settings') {
    //   return (
    //     <SMTPSettings
    //       config={smtpHook.smtpConfig || undefined}
    //       onSave={smtpHook.handleSaveSMTPConfig}
    //       isSubmitting={smtpHook.isSubmitting}
    //       message={smtpHook.message}
    //     />
    //   );
    // }
    // if (viewMode === 'birthday-calendar') {
    //   return (
    //     <BirthdayCalendar
    //       contacts={contactsHook.contacts}
    //       onBack={() => setViewMode('main')}
    //     />
    //   );
    // }
    if (viewMode === 'account-management' && user) {
      return (
        <AccountManagement
          user={user}
          onUpdateProfile={
            handleUpdateProfile as Parameters<typeof AccountManagement>[0]['onUpdateProfile']
          }
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
          <>
            <HomeControls
              userName={user?.firstName || user?.email?.split('@')[0] || 'User'}
              onViewUpcomingBirthdays={() => setViewMode('upcoming-birthdays')}
              onViewContacts={() => setViewMode('contacts')}
              onOpenFacebookPopup={sendShowOverlayToFacebookTab}
              // onViewCalendar={() => setViewMode('birthday-calendar')} // Uncomment to re-enable
            />
          </>
        );

      case 'messages':
        return (
          <>
            <MessagesHub onNavigate={setViewMode} />
          </>
        );

      case 'scheduling':
        return (
          <SchedulingSettings
            timezone={accountTimezone}
            onUpdateTimezone={handleUpdateTimezone}
            isSubmitting={isAccountSubmitting}
          />
        );

      // Contacts tab — currently disabled; contacts are populated via scraping.
      // Uncomment to re-enable the manual contacts UI.
      // case 'contacts':
      //   return (
      //     <ContactList
      //       contacts={contactsHook.contacts}
      //       isLoading={contactsHook.isLoading}
      //       error={contactsHook.error}
      //       onAdd={() => setViewMode('add-contact')}
      //       onEdit={(c) => { contactsHook.selectContact(c); setViewMode('edit-contact'); }}
      //       onDelete={(id) => contactsHook.deleteContact(id)}
      //       onImport={() => contactsHook.setShowImportModal(true)}
      //       onRefresh={() => contactsHook.loadContacts()}
      //     />
      //   );

      case 'account':
        return (
          <div role="tabpanel" id="account-panel" className="tab-content">
            <div className="card mb-3">
              <h2 className="text-lg font-semibold mb-2">Account Information</h2>
              <p className="text-textMuted text-sm">
                Logged in as <strong className="text-textPrimary">{user?.email}</strong>
              </p>
            </div>
            <div className="card mb-3">
              <h3 className="text-md font-semibold mb-2">Account Settings</h3>
              <div className="space-y-3">
                <button onClick={() => setViewMode('account-management')} className="btn btn-block">
                  Profile
                </button>
                {/* SMTP Settings button — commented out until multi-platform support is added */}
                {/* <button onClick={() => setViewMode('smtp-settings')} className="btn btn-block">
                  SMTP Settings
                </button> */}
                <button onClick={() => setViewMode('subscription')} className="btn btn-block">
                  Subscription
                </button>
                <button
                  onClick={() => setViewMode('change-password')}
                  className="btn btn-block"
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

            {/* Timezone Settings — moved to Scheduling tab */}

            {/* Restart Welcome Tour */}
            <div className="card mb-3">
              <button
                type="button"
                onClick={handleRestartTour}
                className="btn-outline-orange w-full text-sm"
              >
                🔄 Restart Welcome Tour
              </button>
            </div>

            {/* Delete Account */}
            <div className="card mb-3">
              {!showAccountDeleteConfirm ? (
                <button
                  onClick={() => setShowAccountDeleteConfirm(true)}
                  className="btn-danger w-full flex items-center justify-center gap-2"
                  disabled={isAccountSubmitting}
                >
                  <span>Delete Account</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-red-700 font-medium">
                    Are you sure you want to delete your account? This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowAccountDeleteConfirm(false)}
                      className="btn-secondary flex-1"
                      disabled={isAccountSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleDeleteAccount()}
                      className="btn-danger flex-1 flex items-center justify-center gap-2"
                      disabled={isAccountSubmitting}
                    >
                      {isAccountSubmitting && <Spinner size="sm" />}
                      <span>{isAccountSubmitting ? 'Deleting...' : 'Confirm Delete'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ---- Render --------------------------------------------------------
  return (
    <div className="popup-root" role="application" aria-label="Birthday Messaging Extension">
      <ScrollToTop />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header role="banner">
        <img
          src="./images/new-logo/BirthdayMessaging_new-logo-orange-text_blue-cake-Primary-Blue.png"
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
            ) : authMode === 'verify-email-pending' ? (
              <div className="text-center py-6 px-4" role="status" aria-live="polite">
                <p className="text-2xl mb-3" aria-hidden="true">
                  &#9993;
                </p>
                <h2 className="text-lg font-bold text-blueStrong mb-2">Check your email</h2>
                <p className="text-sm text-gray-700 mb-4">
                  We sent a verification link to <strong>{email}</strong>. Click the link to verify
                  your account, then come back and log in.
                </p>
                <ResendVerificationEmailButton email={email} />
                <button
                  type="button"
                  className="btn-primary w-full mb-2"
                  onClick={() => {
                    setAuthMode('login');
                    setEmail('');
                  }}
                >
                  Back to Login
                </button>
              </div>
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
          entitlement !== 'active' ? (
            <section className="card" role="status" aria-live="polite">
              {entitlement === 'checking' ? (
                <p>Verifying subscription access…</p>
              ) : (
                <>
                  <p className="mb-3">Your subscription is inactive or could not be verified. Paid features are locked.</p>
                  <SubscriptionPanel />
                  <button type="button" className="btn-outline-orange w-full mt-3" onClick={() => void refreshEntitlement()}>Check subscription again</button>
                  <button type="button" className="btn-outline-orange w-full mt-2" onClick={() => void handleLogout()}>Log out</button>
                </>
              )}
            </section>
          ) : (
          <>
            {renderTabNavigation()}
            <section
              role="tabpanel"
              id={`${activeTab}-panel`}
              aria-labelledby={`${activeTab}-tab`}
              tabIndex={-1}
              className="pb-2"
            >
              {renderView()}
            </section>
          </>
          )
        )}
      </main>

      {isAuthenticated && entitlement === 'active' && (
        <footer role="contentinfo" className="mt-2">
          {activeTab === 'home' && viewMode === 'main' && (
            <button
              type="button"
              onClick={() => setViewMode('analytics')}
              className="messages-hub-card messages-hub-card--orange w-full mb-2"
              aria-label="Analytics"
            >
              <span className="messages-hub-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                  <line x1="2" y1="20" x2="22" y2="20" />
                </svg>
              </span>
              <span className="messages-hub-label">Analytics</span>
              <span className="messages-hub-desc">View message stats</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHelpPanel(true)}
            className="btn-outline-orange w-full text-xs py-1.5"
            aria-label="Open help panel"
          >
            ❓ Help &amp; Tips
          </button>
          <p className="text-center text-xs font-bold mt-2">
            Powered by{' '}
            <a
              href="https://birthdaymessaging.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blueStrong underline hover:opacity-80"
            >
              birthdaymessaging.com
            </a>
          </p>
        </footer>
      )}

      {msgTemplates.showTemplateCreator && viewMode !== 'message-templates' && (
        <div className="modal-overlay">
          <div role="dialog" aria-modal="true" aria-label="Edit message template">
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
          </div>
        </div>
      )}

      {/* Help panel */}
      <HelpPanel
        open={showHelpPanel}
        onClose={() => setShowHelpPanel(false)}
        onRestartTour={handleRestartTour}
      />

      {/* Onboarding wizard — shown once after first login */}
      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingDismiss} onSkip={handleOnboardingDismiss} />
      )}

      {/* Import contacts modal — commented out; contacts populated via scraping.
          Uncomment to re-enable manual import UI.
      {contactsHook.showImportModal && (
        <ImportContactsModal
          onImport={(contacts) => contactsHook.bulkCreateContacts(contacts)}
          onClose={() => contactsHook.setShowImportModal(false)}
          isSubmitting={contactsHook.isSubmitting}
        />
      )}
      */}
    </div>
  );
}
