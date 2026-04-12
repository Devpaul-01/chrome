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
// import MessageGroups from './components/MessageGroups'; // Commented out — feature not currently needed
import ImageManager from './components/ImageManager';
// import SMTPSettings from './components/SMTPSettings'; // Uncomment when SMTP/multi-platform support is added
// Contacts UI — commented out; contacts are populated via scraping. Uncomment to re-enable manual UI.
// import ContactList from './components/ContactList';
// import ContactForm from './components/ContactForm';
// import ImportContactsModal from './components/ImportContactsModal';
// import BirthdayCalendar from './components/BirthdayCalendar';
import UpcomingBirthdays from './components/UpcomingBirthdays';
import MessagesHub from './components/MessagesHub';
import HomeControls from './components/HomeControls';
import AccountManagement from './components/AccountManagement';
import TemplateGallery from './components/TemplateGallery';
import OnboardingWizard from './components/OnboardingWizard';
import HelpPanel from './components/HelpPanel';
import FeatureTip from './components/FeatureTip';
import Spinner from './components/Spinner';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import './popup.css';

import type { UserProfile } from '../api/client';
import { sendBackgroundMessage } from './api';
import { getErrorMessage, logError } from '../utils/errors';
import { getOnboardingComplete, setOnboardingComplete } from '../utils/storage';
import wsClient from '../api/websocket';

import { AppProvider, useAppContext, type AuthMode, type TabType } from './context/AppContext';
import { useSMTPConfig } from './hooks/useSMTPConfig';
import { useMessageTemplates } from './hooks/useMessageTemplates';
import { usePostComposer } from './hooks/usePostComposer';
// import { useContacts } from './hooks/useContacts'; // Uncomment to re-enable contacts UI

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

  const _smtpHook = useSMTPConfig();
  const msgTemplates = useMessageTemplates();
  const post = usePostComposer();
  // const contactsHook = useContacts(); // Uncomment to re-enable contacts UI

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
      setAuthMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  // ---- Account management (mutates user in context) ------------------
  const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountTimezone] = useState(
    () =>
      (user as { timezone?: string } | null)?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    }[] = [
      { id: 'home', label: 'Home' },
      { id: 'messages', label: 'Templates' },
      { id: 'scheduling', label: 'Scheduling' },
      // { id: 'contacts', label: 'Contacts' }, // Uncomment to re-enable contacts tab
      { id: 'account', label: 'Account' },
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
      <nav ref={navRef} className="tab-navigation mb-4" role="tablist" aria-label="Main navigation">
        <div className="flex gap-1" role="presentation">
          {tabs.map((tab, tabIndex) => (
            <div key={tab.id} className="tab-wrapper" role="presentation">
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
            className="btn mt-4"
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
          <button className="btn mt-4" onClick={() => setViewMode('message-templates')}>
            ← Back to Message Templates
          </button>
        </div>
      );
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
            <div className="mb-4">
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
            {/* <div className="mb-6">
              <MessageGroups onClose={() => setViewMode('main')} showClose={false} />
            </div> */}
            <button className="btn w-full" onClick={() => setViewMode('template-gallery')}>
              View/Edit Message Templates
            </button>
          </div>
          <button
            className="btn mt-4"
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
          <h2 className="text-lg font-bold text-blueStrong mb-3">Create Timeline Post</h2>
          <p className="text-xs text-gray-600 mb-4">
            Design a birthday post to be sent to friends&apos; timelines on their special day.
          </p>
          <PostEditor
            postForm={post.postForm}
            setPostForm={post.setPostForm}
            onSubmit={post.handlePostSubmit}
            isSubmitting={post.isSubmitting}
            message={null}
            onViewPosts={() => setViewMode('postLibrary')}
          />
          <button
            className="btn mt-4"
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
    if (viewMode === 'postLibrary') {
      return (
        <div>
          <PostList onClose={() => setViewMode('posts')} />
        </div>
      );
    }
    if (viewMode === 'groups') {
      return null; // MessageGroups commented out — feature not currently needed
      // return <MessageGroups onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'images') {
      return (
        <div>
          <ImageManager onClose={() => setViewMode('main')} />
          <button
            className="btn mt-4"
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
    // Contacts views — commented out; contacts are auto-populated via scraping.
    // Uncomment to re-enable manual contacts management UI.
    // if (viewMode === 'add-contact') {
    //   return (
    //     <ContactForm
    //       onSubmit={(data) => contactsHook.createContact(data)}
    //       onCancel={() => setViewMode('contacts')}
    //       isSubmitting={contactsHook.isSubmitting}
    //     />
    //   );
    // }
    // if (viewMode === 'edit-contact' && contactsHook.selectedContact) {
    //   return (
    //     <ContactForm
    //       contact={contactsHook.selectedContact}
    //       onSubmit={(data) => contactsHook.updateContact(contactsHook.selectedContact!.id, data)}
    //       onCancel={() => setViewMode('contacts')}
    //       isSubmitting={contactsHook.isSubmitting}
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
          // AccountManagement defines its own UserProfile type; cast is intentional
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          user={user as any}
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
            <FeatureTip
              tipId="home_automation"
              message="Enable automation on this page to start sending birthday messages automatically."
            />
            <HomeControls
              userName={user?.email?.split('@')[0] || 'User'}
              onViewAnalytics={() => setViewMode('analytics')}
              onViewUpcomingBirthdays={() => setViewMode('upcoming-birthdays')}
              // onViewCalendar={() => setViewMode('birthday-calendar')} // Uncomment to re-enable
            />
          </>
        );

      case 'messages':
        return (
          <>
            <FeatureTip
              tipId="messages_templates"
              message="Create your first message template to start sending personalised birthday wishes."
            />
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
            <div className="card mb-6">
              <button
                type="button"
                onClick={handleRestartTour}
                className="btn-outline-orange w-full text-sm"
              >
                🔄 Restart Welcome Tour
              </button>
            </div>

            {/* Delete Account */}
            <div className="card mb-6">
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
        )}
      </main>

      {isAuthenticated && (
        <footer role="contentinfo" className="mt-2">
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
