// React imports for state, effect, memoization, and form event typing
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import AuthForm from './components/AuthForm';
import TemplateEditor from './components/TemplateEditor';
import TemplateList from './components/TemplateList';
import TemplateCreator, { type TemplateFormData } from './components/TemplateCreator';
import TemplateGallery, { type SavedTemplate } from './components/TemplateGallery';
import SubscriptionPanel from './components/SubscriptionPanel';
import ForgotPassword from './components/ForgotPassword';
import ChangePassword from './components/ChangePassword';
import ScheduleSettings from './components/ScheduleSettings';
import AutomationSettings from './components/AutomationSettings';
import MessageQueue from './components/MessageQueue';
import MessageHistory from './components/MessageHistory';
import Dashboard from './components/Dashboard';
// Phase 2 components
import PostEditor from './components/PostEditor';
import PostList from './components/PostList';
import MessageGroups from './components/MessageGroups';
import ImageManager from './components/ImageManager';
// New feature components
import ContactList, { type Contact } from './components/ContactList';
import ContactForm from './components/ContactForm';
import ImportContactsModal from './components/ImportContactsModal';
import BirthdayCalendar from './components/BirthdayCalendar';
import SMTPSettings, { type SMTPConfig } from './components/SMTPSettings';
import AccountManagement from './components/AccountManagement';
import Spinner from './components/Spinner';
import Toast, { ToastType } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import './popup.css';

// Type imports for API data structures
import type { TemplateSegment, UserProfile, MessageTemplate } from '../api/client';
import type { SegmentType } from '../api/client';
// Utility for sending messages to the background script
import { sendBackgroundMessage } from './api';
// Error handling utilities
import { getErrorMessage, logError } from '../utils/errors';
// WebSocket client for real-time updates
import wsClient from '../api/websocket';
// Accessibility utilities
import { announceToScreenReader } from '../utils/accessibility';

// All possible template segment types
const SEGMENT_TYPES: SegmentType[] = ['GREETING', 'BODY', 'CLOSING'];

// Auth mode type for toggling between login/register
type AuthMode = 'login' | 'register' | 'forgot-password';

// Tab navigation type
type TabType = 'home' | 'contacts' | 'messages' | 'account';

// View mode for authenticated users
type ViewMode =
  | 'main'
  | 'change-password'
  | 'schedules'
  | 'automation'
  | 'queue'
  | 'history'
  | 'analytics'
  | 'posts'
  | 'post-list'
  | 'groups'
  | 'images'
  | 'contacts'
  | 'add-contact'
  | 'edit-contact'
  | 'import-contacts'
  | 'birthday-calendar'
  | 'smtp-settings'
  | 'account-management'
  | 'subscription';

// State for template segment form
type TemplateForm = {
  segmentType: SegmentType;
  content: string;
  label: string;
};

// Post form type for Phase 2
type PostForm = {
  content: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  image_url?: string;
  label: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
};

// Main popup component
export default function App() {
  // --- State variables ---
  // Auth
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // User session
  const [user, setUser] = useState<UserProfile | null>(null);
  // Template segments
  const [templates, setTemplates] = useState<TemplateSegment[]>([]);
  // Template form state
  const [templateForm, setTemplateForm] = useState<TemplateForm>({
    segmentType: 'GREETING',
    content: '',
    label: '',
  });
  // Post form state for Phase 2
  const [postForm, setPostForm] = useState<PostForm>({
    content: '',
    gender: 'NEUTRAL',
    image_url: '',
    label: '',
    fontFamily: 'Arial',
    fontSize: 48,
    fontColor: '#ffffff',
  });
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  // General message (error/success)
  const [message, setMessage] = useState<string | null>(null);
  // Submission/loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Initial loading state
  const [isInitializing, setIsInitializing] = useState(true);
  // Template loading state
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  // Editing state for template segments
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingLabel, setEditingLabel] = useState('');
  // Automation scan feedback
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  // Contact management state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  // SMTP configuration state
  const [smtpConfig, setSMTPConfig] = useState<SMTPConfig | null>(null);
  // Message Templates (complete templates with greeting/body/closing)
  const [messageTemplates, setMessageTemplates] = useState<SavedTemplate[]>([]);
  const [showTemplateCreator, setShowTemplateCreator] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SavedTemplate | null>(null);

  // Group templates by segment type for organized display
  const groupedTemplates = useMemo(() => {
    return SEGMENT_TYPES.reduce<Record<SegmentType, TemplateSegment[]>>(
      (acc, type) => {
        acc[type] = templates.filter((template) => template.segment_type === type);
        return acc;
      },
      { GREETING: [], BODY: [], CLOSING: [] } as Record<SegmentType, TemplateSegment[]>,
    );
  }, [templates]);

  // Show toast notification
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    // Announce to screen readers
    announceToScreenReader(message, type === 'error' ? 'assertive' : 'polite');
  }, []);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const data = await sendBackgroundMessage<TemplateSegment[]>({ type: 'templates.list' });
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'loadTemplates');
      showToast(errorMessage, 'error');
      setTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [showToast]);

  // Load contacts
  const loadContacts = useCallback(async () => {
    try {
      const data = await sendBackgroundMessage<Contact[]>({ type: 'contacts.list' });
      setContacts(Array.isArray(data) ? data : []);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'loadContacts');
      // Don't show toast for contacts load failure, it's not critical
      setContacts([]);
    }
  }, []);

  // Load SMTP config
  const loadSMTPConfig = useCallback(async () => {
    try {
      const data = await sendBackgroundMessage<SMTPConfig | null>({ type: 'smtp.getConfig' });
      setSMTPConfig(data);
    } catch (error) {
      // SMTP config is optional, don't show error
      logError(error, 'loadSMTPConfig');
      setSMTPConfig(null);
    }
  }, []);

  // Load message templates
  const loadMessageTemplates = useCallback(async () => {
    try {
      const data = await sendBackgroundMessage<MessageTemplate[]>({ type: 'messageTemplates.list' });
      const mapped: SavedTemplate[] = data.map(t => ({
        id: t.id,
        greeting: t.greeting,
        sentiment: t.sentiment,
        closing: t.closing,
        imageUrl: t.image_url,
        templateTitle: t.title,
        daysInAdvance: t.days_in_advance,
        gender: t.gender as 'male' | 'female' | 'all',
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }));
      setMessageTemplates(mapped);
    } catch (error) {
      logError(error, 'loadMessageTemplates');
      setMessageTemplates([]);
    }
  }, []);

  // Refresh user session and templates
  const refreshSession = useCallback(async () => {
    try {
      const profile = await sendBackgroundMessage<UserProfile>({ type: 'auth.me' });
      setUser(profile);
      setMessage(null);
      await Promise.all([loadTemplates(), loadContacts(), loadSMTPConfig(), loadMessageTemplates()]);

      // Initialize WebSocket connection for real-time updates
      try {
        const wsConfig = await sendBackgroundMessage<{ wsUrl: string; token: string }>({
          type: 'config.getWSConfig',
        });
        wsClient.connect({
          url: wsConfig.wsUrl,
          token: wsConfig.token,
          onConnect: () => {
            console.log('[App] WebSocket connected');
          },
          onDisconnect: () => {
            console.log('[App] WebSocket disconnected');
          },
          onError: (error) => {
            logError(error, 'WebSocket');
          },
        });
      } catch (wsError) {
        // Non-critical: WebSocket connection failed, app still works without real-time updates
        logError(wsError, 'refreshSession:websocket');
      }
    } catch (error) {
      logError(error, 'refreshSession');
      setUser(null);
    }
  }, [loadTemplates, loadContacts, loadSMTPConfig, loadMessageTemplates]);

  // Load user session on mount
  const initialize = useCallback(async () => {
    setIsInitializing(true);
    await refreshSession();
    setIsInitializing(false);
  }, [refreshSession]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Handle login/register form submission
  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      await sendBackgroundMessage<{ access_token: string }>({
        type: authMode === 'login' ? 'auth.login' : 'auth.register',
        payload: { email, password },
      });
      await refreshSession();
      setEmail('');
      setPassword('');
      showToast(
        authMode === 'login' ? 'Welcome back!' : 'Account created successfully!',
        'success',
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, `handleAuthSubmit:${authMode}`);
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle new template segment form submission
  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateForm.content.trim()) {
      const errorMsg = 'Template content cannot be empty';
      setMessage(errorMsg);
      showToast(errorMsg, 'warning');
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      // optimistic UI: insert temporary item immediately
      const tempId = `tmp-${Date.now()}`;
      const temp: TemplateSegment = {
        id: tempId,
        segment_type: templateForm.segmentType,
        content: templateForm.content.trim(),
        label: templateForm.label || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTemplates((prev) => [temp, ...prev]);

      // send to background; then refresh to get authoritative data
      await sendBackgroundMessage<TemplateSegment>({
        type: 'templates.create',
        payload: {
          segmentType: templateForm.segmentType,
          content: templateForm.content.trim(),
          label: templateForm.label.trim() || undefined,
        },
      });
      await loadTemplates();
      setTemplateForm({ ...templateForm, content: '', label: '' });
      showToast('Template saved successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleTemplateSubmit');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Delete a template segment by ID
  async function handleTemplateDelete(id: string) {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }
    // optimistic delete: remove locally first
    const prev = templates;
    setTemplates((t) => t.filter((item) => item.id !== id));
    try {
      await sendBackgroundMessage<void>({ type: 'templates.delete', payload: { id } });
      showToast('Template deleted', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleTemplateDelete');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
      // revert if deletion failed
      setTemplates(prev);
    }
  }

  // Update a template segment by ID
  async function handleTemplateUpdate(id: string) {
    if (!editingContent.trim()) {
      const errorMsg = 'Content is required';
      setMessage(errorMsg);
      showToast(errorMsg, 'warning');
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      await sendBackgroundMessage<TemplateSegment>({
        type: 'templates.update',
        payload: { id, content: editingContent.trim(), label: editingLabel.trim() || undefined },
      });
      setEditingId(null);
      setEditingContent('');
      setEditingLabel('');
      await loadTemplates();
      showToast('Template updated successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleTemplateUpdate');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Log out the current user
  const handleLogout = useCallback(async () => {
    if (!confirm('Are you sure you want to log out?')) {
      return;
    }
    setIsSubmitting(true);
    try {
      await sendBackgroundMessage<void>({ type: 'auth.logout' });
      // Disconnect WebSocket
      wsClient.disconnect();
      setUser(null);
      setTemplates([]);
      showToast('Logged out successfully', 'info');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleLogout');
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [showToast]);

  // (subscription and config responsibilities moved to dedicated components)

  // Trigger Facebook birthday scan automation
  async function fireAutomationScan() {
    try {
      const result = await sendBackgroundMessage<{ success: boolean }>({
        type: 'automation.scanFacebook',
      });
      const message = result.success ? 'Scan triggered successfully' : 'No Facebook tab found';
      setAutomationMessage(message);
      showToast(message, result.success ? 'success' : 'warning');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'fireAutomationScan');
      setAutomationMessage(errorMessage);
      showToast(errorMessage, 'error');
    }
  }

  // --- Contact Management Handlers ---
  // Note: These are scaffolded handlers. Backend API endpoints need to be implemented.

  async function handleAddContact(
    contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const newContact = await sendBackgroundMessage<Contact>({
        type: 'contacts.create',
        payload: contact,
      });
      setContacts((prev) => [newContact, ...prev]);
      setViewMode('contacts');
      showToast('Contact added successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleAddContact');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateContact(
    contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    if (!editingContact) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const updatedContact = await sendBackgroundMessage<Contact>({
        type: 'contacts.update',
        payload: { id: editingContact.id, ...contact },
      });
      setContacts((prev) =>
        prev.map((c) => (c.id === editingContact.id ? updatedContact : c)),
      );
      setEditingContact(null);
      setViewMode('contacts');
      showToast('Contact updated successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleUpdateContact');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteContact(id: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    const prev = contacts;
    setContacts((c) => c.filter((contact) => contact.id !== id));
    try {
      await sendBackgroundMessage<{ status: string }>({ type: 'contacts.delete', payload: { id } });
      showToast('Contact deleted', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleDeleteContact');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
      setContacts(prev);
    }
  }

  async function handleImportContacts(
    importedContacts: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<void> {
    try {
      const newContacts = await sendBackgroundMessage<Contact[]>({
        type: 'contacts.bulkCreate',
        payload: importedContacts,
      });
      setContacts((prev) => [...newContacts, ...prev]);
      setShowImportModal(false);
      showToast(`Successfully imported ${newContacts.length} contacts!`, 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleImportContacts');
      showToast(errorMessage, 'error');
      throw error;
    }
  }

  // --- SMTP Settings Handlers ---
  async function handleSaveSMTPConfig(config: SMTPConfig): Promise<void> {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const updatedConfig = await sendBackgroundMessage<SMTPConfig>({
        type: 'smtp.updateConfig',
        payload: config,
      });
      setSMTPConfig(updatedConfig);
      showToast('SMTP settings saved successfully!', 'success');
      setViewMode('main');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleSaveSMTPConfig');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- Message Template Handlers ---
  async function handleCreateTemplate(data: TemplateFormData): Promise<void> {
    try {
      await sendBackgroundMessage({
        type: 'messageTemplates.create',
        payload: {
          title: data.templateTitle,
          greeting: data.greeting,
          sentiment: data.sentiment,
          closing: data.closing,
          image_url: data.imageUrl,
          days_in_advance: data.daysInAdvance,
          gender: data.gender,
        },
      });
      await loadMessageTemplates();
      setShowTemplateCreator(false);
      setEditingTemplate(null);
      showToast('Template created successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleCreateTemplate');
      showToast(errorMessage, 'error');
      throw error;
    }
  }

  async function handleDeleteTemplate(id: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await sendBackgroundMessage({
        type: 'messageTemplates.delete',
        payload: { id },
      });
      await loadMessageTemplates();
      showToast('Template deleted successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleDeleteTemplate');
      showToast(errorMessage, 'error');
    }
  }

  // --- Account Management Handlers ---
  async function handleUpdateProfile(profile: Partial<UserProfile>): Promise<void> {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const updated = await sendBackgroundMessage<UserProfile>({
        type: 'auth.updateProfile',
        payload: profile,
      });
      setUser(updated);
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleUpdateProfile');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateTimezone(timezone: string): Promise<void> {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const updated = await sendBackgroundMessage<UserProfile>({
        type: 'auth.updateProfile',
        payload: { timezone },
      });
      setUser(updated);
      showToast('Timezone updated successfully!', 'success');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleUpdateTimezone');
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteAccount(): Promise<void> {
    setIsSubmitting(true);
    try {
      await sendBackgroundMessage<{ message: string }>({ type: 'auth.deleteAccount' });
      wsClient.disconnect();
      setUser(null);
      setContacts([]);
      setTemplates([]);
      showToast('Account deleted successfully', 'info');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logError(error, 'handleDeleteAccount');
      showToast(errorMessage, 'error');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  // Whether the user is currently authenticated
  const isAuthenticated = Boolean(user);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Alt+L for logout (when authenticated)
      if (event.altKey && event.key === 'l' && isAuthenticated) {
        event.preventDefault();
        handleLogout();
      }
      // Alt+H for home/main view (when authenticated)
      if (event.altKey && event.key === 'h' && isAuthenticated && viewMode !== 'main') {
        event.preventDefault();
        setViewMode('main');
        setActiveTab('contacts');
        announceToScreenReader('Navigated to main view');
      }
      // Escape to close modal views
      if (event.key === 'Escape' && viewMode !== 'main' && isAuthenticated) {
        event.preventDefault();
        setViewMode('main');
        announceToScreenReader('Returned to main view');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, viewMode, handleLogout]);

  // Render tab navigation
  const renderTabNavigation = () => {
    const tabs: {
      id: TabType;
      label: string;
      menuItems?: { label: string; action: () => void }[];
    }[] = [
      {
        id: 'home',
        label: 'Home',
      },
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
          { label: 'Add Template', action: () => { setActiveTab('messages'); setViewMode('main'); setShowTemplateCreator(true); } },
          { label: 'View Templates', action: () => { setActiveTab('messages'); setViewMode('main'); setShowTemplateCreator(false); } },
          { label: 'Schedule Message', action: () => setViewMode('schedules') },
          { label: 'Automation', action: () => setViewMode('automation') },
          { label: 'Queue', action: () => setViewMode('queue') },
          { label: 'Sent Messages', action: () => setViewMode('history') },
          { label: 'Analytics', action: () => setViewMode('analytics') },
          { label: 'Create Post', action: () => setViewMode('posts') },
          { label: 'View Posts', action: () => setViewMode('post-list') },
          { label: 'Message Groups', action: () => setViewMode('groups') },
          { label: 'Images', action: () => setViewMode('images') },
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
          { label: 'Sign Out', action: () => handleLogout() },
        ],
      },
    ];

    return (
      <nav className="tab-navigation mb-4" role="tablist">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <div key={tab.id} className="tab-wrapper">
              <button
                role="tab"
                aria-selected={activeTab === tab.id ? 'true' : 'false'}
                aria-controls={`${tab.id}-panel`}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setViewMode('main');
                }}
              >
                {tab.label}
              </button>
              {tab.menuItems && tab.menuItems.length > 0 && (
                <div className="tab-dropdown">
                  {tab.menuItems.map((item, index) => (
                    <button
                      key={index}
                      className="tab-dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        item.action();
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

  // Render tab content based on active tab
  const renderTabContent = () => {
    // Handle special view modes first
    if (viewMode === 'change-password') {
      return (
        <ChangePassword
          onCancel={() => setViewMode('main')}
          onSuccess={() => setViewMode('main')}
        />
      );
    }
    if (viewMode === 'schedules') {
      return <ScheduleSettings onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'automation') {
      return <AutomationSettings onClose={() => setViewMode('main')} />;
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
    if (viewMode === 'posts') {
      return (
        <div>
          <PostEditor
            postForm={postForm}
            setPostForm={setPostForm}
            onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmitting(true);
              try {
                showToast('Post creation not yet implemented', 'warning');
              } catch (error) {
                showToast(getErrorMessage(error), 'error');
              } finally {
                setIsSubmitting(false);
              }
            }}
            isSubmitting={isSubmitting}
            message={message}
          />
          <button onClick={() => setViewMode('main')} className="btn-secondary btn-block mt-3">
            ← Back to Main
          </button>
        </div>
      );
    }
    if (viewMode === 'post-list') {
      return <PostList onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'groups') {
      return <MessageGroups onClose={() => setViewMode('main')} />;
    }
    if (viewMode === 'images') {
      return <ImageManager onClose={() => setViewMode('main')} />;
    }
    // Contact management views
    if (viewMode === 'contacts') {
      return (
        <ContactList
          contacts={contacts}
          onAddContact={() => setViewMode('add-contact')}
          onImportContacts={() => setShowImportModal(true)}
          onEditContact={(contact) => {
            setEditingContact(contact);
            setViewMode('edit-contact');
          }}
          onDeleteContact={handleDeleteContact}
        />
      );
    }
    if (viewMode === 'add-contact') {
      return (
        <ContactForm
          onSubmit={handleAddContact}
          onCancel={() => setViewMode('contacts')}
          isSubmitting={isSubmitting}
          message={message}
        />
      );
    }
    if (viewMode === 'edit-contact' && editingContact) {
      return (
        <ContactForm
          contact={editingContact}
          onSubmit={handleUpdateContact}
          onCancel={() => {
            setEditingContact(null);
            setViewMode('contacts');
          }}
          isSubmitting={isSubmitting}
          message={message}
        />
      );
    }
    if (viewMode === 'birthday-calendar') {
      return <BirthdayCalendar contacts={contacts} />;
    }
    if (viewMode === 'smtp-settings') {
      return (
        <SMTPSettings
          config={smtpConfig || undefined}
          onSave={handleSaveSMTPConfig}
          onBack={() => setViewMode('main')}
          isSubmitting={isSubmitting}
          message={message}
        />
      );
    }
    if (viewMode === 'account-management' && user) {
      return (
        <AccountManagement
          user={user}
          onUpdateProfile={handleUpdateProfile}
          onUpdateTimezone={handleUpdateTimezone}
          onDeleteAccount={handleDeleteAccount}
          onLogout={handleLogout}
          isSubmitting={isSubmitting}
          message={message}
        />
      );
    }
    if (viewMode === 'subscription') {
      return (
        <div>
          <SubscriptionPanel />
          <button onClick={() => setViewMode('main')} className="btn-secondary btn-block mt-3">
            ← Back to Main
          </button>
        </div>
      );
    }

    // Render main tab content
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

            {/* Stats Section */}
            <div className="card mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blueStrong">{contacts.length}</div>
                  <div className="text-xs text-textMuted">Contacts</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blueStrong">{contacts.length}</div>
                  <div className="text-xs text-textMuted">Birthdays</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blueStrong">0</div>
                  <div className="text-xs text-textMuted">Scheduled</div>
                </div>
              </div>
            </div>

            <div className="h-4" />

            {/* Upcoming Birthdays */}
            <div className="card mb-6">
              <h3 className="text-lg font-semibold text-blueStrong mb-4">Upcoming Birthdays</h3>
              <div className="bg-surfaceSection rounded-lg p-4 text-center text-textMuted">
                {contacts.length === 0
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

            {/* Quick Tip */}
            <div className="card mb-6 bg-surfaceSection">
              <div>
                <h4 className="font-semibold text-orangeStrong mb-1">Quick Tip</h4>
                <p className="text-sm text-textMuted">
                  Set up your contacts first to easily send personalized birthday messages
                </p>
              </div>
            </div>

            <div className="h-6" />

            {/* View Analytics Button */}
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
              contacts={contacts}
              onAddContact={() => setViewMode('add-contact')}
              onImportContacts={() => setShowImportModal(true)}
              onEditContact={(contact) => {
                setEditingContact(contact);
                setViewMode('edit-contact');
              }}
              onDeleteContact={handleDeleteContact}
            />
          </div>
        );

      case 'messages':
        return (
          <div role="tabpanel" id="messages-panel" className="tab-content">
            {showTemplateCreator ? (
              <TemplateCreator
                onSubmit={editingTemplate 
                  ? (data) => handleUpdateTemplate(editingTemplate.id, data)
                  : handleCreateTemplate
                }
                onCancel={() => {
                  setShowTemplateCreator(false);
                  setEditingTemplate(null);
                }}
                initialData={editingTemplate ? {
                  greeting: editingTemplate.greeting,
                  sentiment: editingTemplate.sentiment,
                  closing: editingTemplate.closing,
                  imageUrl: editingTemplate.imageUrl,
                  templateTitle: editingTemplate.templateTitle,
                  daysInAdvance: editingTemplate.daysInAdvance,
                  gender: editingTemplate.gender,
                } : undefined}
              />
            ) : (
              <>
                <div className="mb-4">
                  <TemplateGallery
                    templates={messageTemplates}
                    onEdit={(template) => {
                      setEditingTemplate(template);
                      setShowTemplateCreator(true);
                    }}
                    onDelete={handleDeleteTemplate}
                    onCreate={() => setShowTemplateCreator(true)}
                  />
                </div>
              </>
            )}
          </div>
        );

      case 'account':
        return (
          <div role="tabpanel" id="account-panel" className="tab-content">
            {/* User info */}
            <div className="card mb-6">
              <h2 className="text-lg font-semibold mb-4">Account Information</h2>
              <p className="text-textMuted text-sm mb-2">
                Logged in as <strong className="text-textPrimary">{user?.email}</strong>
              </p>
            </div>

            <div className="h-4" />

            {/* Account actions */}
            <div className="card mb-6">
              <h3 className="text-md font-semibold mb-4">Account Settings</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setViewMode('change-password')}
                  className="btn-secondary btn-block"
                  disabled={isSubmitting}
                >
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="btn-primary btn-block"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>

            {/* Subscription Panel */}
            <SubscriptionPanel />
          </div>
        );

      default:
        return null;
    }
  };

  // --- Render ---
  return (
    <ErrorBoundary>
      <div className="popup-root" role="application" aria-label="Birthday Messaging Extension">
        {/* Skip links for keyboard navigation */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}

        {/* App logo and title */}
        <header role="banner">
          <img
            src="./images/Birthday_messaging-logo.png"
            alt="Birthday Messaging Logo"
            className="app-logo block mx-auto mb-2"
          />
          <h1 className="app-title hidden">BirthdayMessaging</h1>
        </header>

        {/* Initial loading state */}
        {isInitializing ? (
          <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
            <Spinner size="lg" message="Initializing..." />
          </div>
        ) : null}

        {/* General error/success message */}
        <main id="main-content" role="main">
          {!isInitializing && message && <div className="error">{message}</div>}

          {/* Auth form (login/register) */}
          {!isInitializing && !isAuthenticated ? (
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
                  isSubmitting={isSubmitting}
                  onSubmit={handleAuthSubmit}
                  message={message}
                />
              )}
            </>
          ) : (
            !isInitializing && (
              <>
                {renderTabNavigation()}
                {renderTabContent()}
              </>
            )
          )}
        </main>

        {/* Footer with keyboard shortcuts help */}
        {isAuthenticated && (
          <footer role="contentinfo" className="mt-2">
            <details className="card text-xs">
              <summary className="cursor-pointer font-semibold text-textPrimary hover:text-blueStrong">
                Keyboard Shortcuts
              </summary>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>
                  <kbd className="px-1 py-0.5 bg-gray-200 rounded">Alt+H</kbd> - Home
                </li>
                <li>
                  <kbd className="px-1 py-0.5 bg-gray-200 rounded">Alt+L</kbd> - Logout
                </li>
                <li>
                  <kbd className="px-1 py-0.5 bg-gray-200 rounded">Esc</kbd> - Close modal
                </li>
              </ul>
            </details>
          </footer>
        )}

        {/* Import Contacts Modal */}
        {showImportModal && (
          <ImportContactsModal
            onClose={() => setShowImportModal(false)}
            onImport={handleImportContacts}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
