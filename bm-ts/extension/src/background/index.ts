import {
  ApiError,
  CheckoutSessionResponse,
  TemplateSegment,
  TokenResponse,
  SubscriptionStatus,
  UserProfile,
  BirthdaySchedule,
  QueuedMessage,
  MessageHistoryItem,
  DashboardStats,
  Contact,
  MessageGroup,
  Post,
  UserImage,
  SMTPConfig,
  MessageTemplate,
  createCheckoutSession as createCheckoutSessionRequest,
  createTemplate,
  deleteTemplate,
  listTemplates,
  login,
  me,
  refreshToken as refreshTokenEndpoint,
  register,
  subscriptionStatus,
  updateTemplate,
  requestPasswordReset,
  resetPassword,
  changePassword,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  listQueuedMessages,
  updateQueuedMessage,
  cancelQueuedMessage,
  retryQueuedMessage,
  listMessageHistory,
  deleteMessageHistory,
  getDashboardStats,
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  bulkCreateContacts,
  listMessageGroups,
  createMessageGroup,
  updateMessageGroup,
  deleteMessageGroup,
  listPosts,
  createPost,
  updatePost,
  deletePost,
  listImages,
  createImage,
  deleteImage,
  getSMTPConfig,
  updateSMTPConfig,
  updateUserProfile,
  listMessageTemplates,
  createMessageTemplate,
  getMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  deleteUserAccount,
} from '../api/client';
import {
  clearTokens,
  getBackendUrl,
  getTokens,
  saveTokens,
  setBackendUrl,
  TokenBundle,
} from '../utils/storage';
import { BackgroundMessage } from '../utils/messages';
import {
  AutomationConfig,
  getAutomationConfig,
  updateAutomationEnabled,
  updateCheckInterval,
  updateLastCheck,
} from '../utils/automation';
import logger from '../utils/logger';

const AUTH_ERROR = new ApiError(401, { detail: 'Not authenticated' });

async function refreshTokensFlow(
  existingRefreshToken: string,
  baseUrl: string,
): Promise<TokenResponse> {
  const tokens = await refreshTokenEndpoint(baseUrl, existingRefreshToken);
  await saveTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
  return tokens;
}

async function ensureTokens(baseUrl: string): Promise<TokenBundle> {
  let tokens = await getTokens();
  if (!tokens.accessToken) {
    if (!tokens.refreshToken) {
      throw AUTH_ERROR;
    }
    const refreshed = await refreshTokensFlow(tokens.refreshToken, baseUrl);
    tokens = { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token };
  }
  return tokens;
}

type AuthCall<T> = (accessToken: string, baseUrl: string) => Promise<T>;

async function withAuth<T>(fn: AuthCall<T>): Promise<T> {
  const baseUrl = await getBackendUrl();
  const tokens = await ensureTokens(baseUrl);
  try {
    return await fn(tokens.accessToken!, baseUrl);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && tokens.refreshToken) {
      const refreshed = await refreshTokensFlow(tokens.refreshToken, baseUrl);
      return fn(refreshed.access_token, baseUrl);
    }
    throw error;
  }
}

async function handleAutomationScan(): Promise<{ success: boolean }> {
  const tab = await queryActiveFacebookTab();
  if (!tab?.id) {
    return { success: false };
  }
  chrome.tabs.sendMessage(tab.id, { type: 'automation.scan' });
  await updateLastCheck();
  return { success: true };
}

function queryActiveFacebookTab(): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs.find((tab) => tab.url?.includes('facebook.com')));
    });
  });
}

type BackgroundResponse =
  | TokenResponse
  | UserProfile
  | TemplateSegment[]
  | TemplateSegment
  | { status: string }
  | SubscriptionStatus
  | CheckoutSessionResponse
  | BirthdaySchedule
  | BirthdaySchedule[]
  | AutomationConfig
  | QueuedMessage
  | QueuedMessage[]
  | MessageHistoryItem[]
  | DashboardStats
  | Contact
  | Contact[]
  | MessageGroup
  | MessageGroup[]
  | Post
  | Post[]
  | UserImage
  | UserImage[]
  | SMTPConfig
  | { success: boolean }
  | { backendUrl: string }
  | { wsUrl: string; token: string }
  | { message: string }
  | null;

async function runAuthAware<T>(call: AuthCall<T>): Promise<T> {
  return withAuth(call);
}

async function handleMessage(message: BackgroundMessage): Promise<BackgroundResponse> {
  const baseUrl = await getBackendUrl();
  switch (message.type) {
    case 'auth.register': {
      const tokens = await register(baseUrl, message.payload);
      await saveTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      return tokens;
    }
    case 'auth.login': {
      const tokens = await login(baseUrl, message.payload);
      await saveTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      return tokens;
    }
    case 'auth.refresh': {
      const tokens = await getTokens();
      if (!tokens.refreshToken) {
        throw AUTH_ERROR;
      }
      return refreshTokensFlow(tokens.refreshToken, baseUrl);
    }
    case 'auth.logout': {
      await clearTokens();
      return { message: 'logged out' };
    }
    case 'auth.requestPasswordReset': {
      return requestPasswordReset(baseUrl, message.payload);
    }
    case 'auth.resetPassword': {
      return resetPassword(baseUrl, message.payload);
    }
    case 'auth.changePassword': {
      return runAuthAware((accessToken, url) =>
        changePassword(url, accessToken, {
          current_password: message.payload.currentPassword,
          new_password: message.payload.newPassword,
        }),
      );
    }
    case 'auth.me': {
      return runAuthAware((accessToken, url) => me(url, accessToken));
    }
    case 'templates.list': {
      return runAuthAware((accessToken, url) =>
        listTemplates(url, accessToken, message.segmentType),
      );
    }
    case 'templates.create': {
      return runAuthAware((accessToken, url) =>
        createTemplate(
          url,
          accessToken,
          message.payload.segmentType,
          message.payload.content,
          message.payload.label,
        ),
      );
    }
    case 'templates.update': {
      return runAuthAware((accessToken, url) =>
        updateTemplate(
          url,
          accessToken,
          message.payload.id,
          message.payload.content,
          message.payload.label,
        ),
      );
    }
    case 'templates.delete': {
      return runAuthAware((accessToken, url) =>
        deleteTemplate(url, accessToken, message.payload.id),
      );
    }
    case 'subscription.status': {
      return runAuthAware((accessToken, url) => subscriptionStatus(url, accessToken));
    }
    case 'subscription.checkout': {
      return runAuthAware((accessToken, url) =>
        createCheckoutSessionRequest(url, accessToken, message.payload),
      );
    }
    case 'config.getBackendUrl': {
      return { backendUrl: baseUrl };
    }
    case 'config.setBackendUrl': {
      await setBackendUrl(message.payload.backendUrl);
      return { backendUrl: message.payload.backendUrl };
    }
    case 'config.getWSConfig': {
      const tokens = await getTokens();
      if (!tokens?.accessToken) {
        throw new Error('Not authenticated');
      }
      // Convert http/https to ws/wss
      const wsUrl = baseUrl.replace(/^http/, 'ws');
      return {
        wsUrl: `${wsUrl}/ws`,
        token: tokens.accessToken,
      };
    }
    case 'schedules.list': {
      return runAuthAware((accessToken, url) => listSchedules(url, accessToken));
    }
    case 'schedules.create': {
      return runAuthAware((accessToken, url) => createSchedule(url, accessToken, message.payload));
    }
    case 'schedules.update': {
      return runAuthAware((accessToken, url) =>
        updateSchedule(url, accessToken, message.payload.id, {
          enabled: message.payload.enabled,
        }),
      );
    }
    case 'schedules.delete': {
      return runAuthAware((accessToken, url) =>
        deleteSchedule(url, accessToken, message.payload.id),
      );
    }
    case 'automation.getConfig': {
      return getAutomationConfig();
    }
    case 'automation.setEnabled': {
      return updateAutomationEnabled(message.payload.enabled);
    }
    case 'automation.setInterval': {
      return updateCheckInterval(message.payload.minutes);
    }
    case 'messages.listQueue': {
      return runAuthAware((accessToken, url) => listQueuedMessages(url, accessToken));
    }
    case 'messages.updateQueued': {
      return runAuthAware((accessToken, url) =>
        updateQueuedMessage(url, accessToken, message.payload.id, {
          message_content: message.payload.message_content,
          scheduled_send_time: message.payload.scheduled_send_time,
        }),
      );
    }
    case 'messages.cancelQueued': {
      return runAuthAware((accessToken, url) =>
        cancelQueuedMessage(url, accessToken, message.payload.id),
      );
    }
    case 'messages.retryQueued': {
      return runAuthAware((accessToken, url) =>
        retryQueuedMessage(url, accessToken, message.payload.id),
      );
    }
    case 'messages.listHistory': {
      return runAuthAware((accessToken, url) => listMessageHistory(url, accessToken));
    }
    case 'messages.deleteHistory': {
      return runAuthAware((accessToken, url) =>
        deleteMessageHistory(url, accessToken, message.payload.id),
      );
    }
    case 'dashboard.getStats': {
      const config = await getAutomationConfig();
      const baseStats = await runAuthAware((accessToken, url) =>
        getDashboardStats(url, accessToken),
      );
      return {
        ...baseStats,
        automation_enabled: config.enabled,
        next_scheduled_check: config.nextCheck ?? undefined,
      };
    }
    case 'automation.scanFacebook': {
      return handleAutomationScan();
    }
    // Contact handlers
    case 'contacts.list': {
      return runAuthAware((accessToken, url) => listContacts(url, accessToken));
    }
    case 'contacts.create': {
      return runAuthAware((accessToken, url) => createContact(url, accessToken, message.payload));
    }
    case 'contacts.update': {
      const { id, ...payload } = message.payload;
      return runAuthAware((accessToken, url) => updateContact(url, accessToken, id, payload));
    }
    case 'contacts.delete': {
      return runAuthAware((accessToken, url) => deleteContact(url, accessToken, message.payload.id));
    }
    case 'contacts.bulkCreate': {
      return runAuthAware((accessToken, url) => bulkCreateContacts(url, accessToken, message.payload));
    }
    // Message Group handlers
    case 'messageGroups.list': {
      return runAuthAware((accessToken, url) => listMessageGroups(url, accessToken));
    }
    case 'messageGroups.create': {
      return runAuthAware((accessToken, url) => createMessageGroup(url, accessToken, message.payload));
    }
    case 'messageGroups.update': {
      const { id, ...payload } = message.payload;
      return runAuthAware((accessToken, url) => updateMessageGroup(url, accessToken, id, payload));
    }
    case 'messageGroups.delete': {
      return runAuthAware((accessToken, url) => deleteMessageGroup(url, accessToken, message.payload.id));
    }
    // Post handlers
    case 'posts.list': {
      return runAuthAware((accessToken, url) => listPosts(url, accessToken));
    }
    case 'posts.create': {
      return runAuthAware((accessToken, url) => createPost(url, accessToken, message.payload));
    }
    case 'posts.update': {
      const { id, ...payload } = message.payload;
      return runAuthAware((accessToken, url) => updatePost(url, accessToken, id, payload));
    }
    case 'posts.delete': {
      return runAuthAware((accessToken, url) => deletePost(url, accessToken, message.payload.id));
    }
    // Image handlers
    case 'images.list': {
      return runAuthAware((accessToken, url) => listImages(url, accessToken));
    }
    case 'images.create': {
      return runAuthAware((accessToken, url) => createImage(url, accessToken, message.payload));
    }
    case 'images.delete': {
      return runAuthAware((accessToken, url) => deleteImage(url, accessToken, message.payload.id));
    }
    // SMTP handlers
    case 'smtp.getConfig': {
      return runAuthAware((accessToken, url) => getSMTPConfig(url, accessToken));
    }
    case 'smtp.updateConfig': {
      return runAuthAware((accessToken, url) => updateSMTPConfig(url, accessToken, message.payload));
    }
    // User Profile handlers
    case 'auth.updateProfile': {
      return runAuthAware((accessToken, url) => updateUserProfile(url, accessToken, message.payload));
    }
    // Message Template handlers
    case 'messageTemplates.list': {
      return runAuthAware((accessToken, url) => listMessageTemplates(url, accessToken, message.gender));
    }
    case 'messageTemplates.create': {
      return runAuthAware((accessToken, url) => createMessageTemplate(url, accessToken, message.payload));
    }
    case 'messageTemplates.get': {
      return runAuthAware((accessToken, url) => getMessageTemplate(url, accessToken, message.payload.id));
    }
    case 'messageTemplates.update': {
      const { id, ...payload } = message.payload;
      return runAuthAware((accessToken, url) => updateMessageTemplate(url, accessToken, id, payload));
    }
    case 'messageTemplates.delete': {
      return runAuthAware((accessToken, url) => deleteMessageTemplate(url, accessToken, message.payload.id));
    }
    case 'auth.deleteAccount': {
      await runAuthAware((accessToken, url) => deleteUserAccount(url, accessToken));
      await clearTokens();
      return { message: 'Account deleted successfully' };
    }
    default:
      throw new ApiError(400, { detail: 'Unknown action' });
  }
}

chrome.runtime.onMessage.addListener((request: BackgroundMessage, _sender, sendResponse) => {
  logger.debug('Received message:', request.type);

  handleMessage(request)
    .then((response) => {
      logger.success('Message handled successfully:', request.type);
      sendResponse({ success: true, data: response });
    })
    .catch((error) => {
      logger.error(`Message handler error for ${request.type}:`, error);

      if (error instanceof ApiError) {
        sendResponse({
          success: false,
          error: {
            status: error.status,
            message: error.message,
            data: error.data,
          },
        });
      } else {
        sendResponse({
          success: false,
          error: {
            status: 500,
            message: error?.message ?? 'Unknown error',
          },
        });
      }
    });
  return true; // Indicates async response
});

async function initializeAuthState(): Promise<void> {
  logger.info('Initializing auth state...');
  const tokens = await getTokens();
  if (!tokens.accessToken) {
    logger.info('No access token found, skipping auth initialization');
    return;
  }
  const baseUrl = await getBackendUrl();
  logger.info('Backend URL:', baseUrl);
  try {
    await me(baseUrl, tokens.accessToken);
    logger.success('Auth state initialized successfully');
  } catch (error) {
    logger.warn('Auth initialization failed:', error);
    if (error instanceof ApiError && error.status === 401 && tokens.refreshToken) {
      logger.info('Attempting to refresh token...');
      await refreshTokensFlow(tokens.refreshToken, baseUrl);
      logger.success('Token refreshed successfully');
      return;
    }
    logger.info('Clearing invalid tokens');
    await clearTokens();
  }
}

void initializeAuthState();

// Chrome Alarms listener for automation
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'birthday-check-alarm') {
    const config = await getAutomationConfig();
    if (config.enabled) {
      await handleAutomationScan();
    }
  }
});

// Initialize automation on startup
async function initializeAutomation(): Promise<void> {
  const config = await getAutomationConfig();
  if (config.enabled) {
    // Reschedule alarms on extension startup
    await chrome.alarms.clear('birthday-check-alarm');
    await chrome.alarms.create('birthday-check-alarm', {
      delayInMinutes: config.checkInterval,
      periodInMinutes: config.checkInterval,
    });
  }
}

void initializeAutomation();
