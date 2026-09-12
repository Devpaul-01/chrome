import {
  ApiError,
  BillingPortalResponse,
  CheckoutSessionResponse,
  TemplateSegment,
  TokenResponse,
  SubscriptionStatus,
  UserProfile,
  QueuedMessage,
  MessageHistoryItem,
  MessageHistoryPage,
  DashboardStats,
  Post,
  UserImage,
  SMTPConfig,
  MessageTemplate,
  createBTCPayCheckout,
  cancelSubscription,
  reactivateSubscription,
  changeSubscriptionPlan,
  getBillingPortal,
  createTemplate,
  deleteTemplate,
  listTemplates,
  login,
  me,
  refreshToken as refreshTokenEndpoint,
  register,
  revokeToken,
  subscriptionStatus,
  updateTemplate,
  requestPasswordReset,
  resetPassword,
  changePassword,
  requestEmailVerification,
  listQueuedMessages,
  updateQueuedMessage,
  cancelQueuedMessage,
  retryQueuedMessage,
  listMessageHistory,
  deleteMessageHistory,
  getDashboardStats,
  listPosts,
  createPost,
  updatePost,
  deletePost,
  listImages,
  createImage,
  uploadImageFile,
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
  BirthdayConfig,
  listBirthdayConfigs,
  toggleBirthdayConfig,
  getServerRateLimitStatus,
  recordServerSend,
  ServerRateLimitStatus,
  listContacts,
  createContact,
  deleteContact,
  bulkCreateContacts,
  cleanupGarbledContacts,
  Contact,
  updateContact,
  MessageGroup,
  listMessageGroups,
  createMessageGroup,
  updateMessageGroup,
  deleteMessageGroup,
} from '../api/client';
import {
  clearTokens,
  getBackendUrl,
  getTokens,
  saveTokens,
  setBackendUrl,
  TokenBundle,
} from '../utils/storage';
import { AutomationRunPayload, BackgroundMessage } from '../utils/messages';
import {
  AutomationConfig,
  getAutomationConfig,
  updateAutomationEnabled,
  updateCheckInterval,
  updateLastCheck,
  getSentToday,
  addToSentToday,
  clearSentToday,
  updateMaxMessages,
  getPreferredHours,
  setPreferredHours,
  isWithinPreferredHours,
  type PreferredHours,
} from '../utils/automation';
import {
  getEmergencyStopState,
  triggerEmergencyStop,
  clearEmergencyStop,
  isEmergencyStopActive,
  getActivityLog,
  clearActivityLog,
  addActivityLogEntry,
  getRateLimitSummary,
  checkRateLimit,
  isBackoffPaused,
  getConfirmationMode,
  setConfirmationMode,
  setShouldAbort,
  requestAlarmsPermission,
} from '../utils/failsafe';
import type { ConfirmationMode } from '../utils/failsafe';
import {
  notifyAutomationComplete,
  notifyAutomationFailed,
  notifyAutomationPaused,
} from '../utils/notifications';
import { saveCheckpoint, clearCheckpoint, checkForStaleCheckpoint } from '../utils/crash-recovery';
import { handleInstallOrUpdate } from '../utils/update-check';
import logger from '../utils/logger';

/**
 * Sentinel `ApiError` thrown when no valid access/refresh tokens are available.
 * Using a pre-allocated instance avoids creating a new Error object on every
 * unauthenticated call while still being recognisable by `instanceof ApiError`.
 */
const AUTH_ERROR = new ApiError(401, { detail: 'Not authenticated' });

let refreshInFlight: Promise<TokenResponse> | null = null;

/**
 * Calls the refresh-token endpoint, persists the new token pair to storage,
 * and returns the raw `TokenResponse`.
 *
 * All token refresh logic in this file goes through this single function to
 * keep storage state consistent.
 */
async function refreshTokensFlow(
  existingRefreshToken: string,
  baseUrl: string,
): Promise<TokenResponse> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const tokens = await refreshTokenEndpoint(baseUrl, existingRefreshToken);
      await saveTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      return tokens;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Returns a valid `TokenBundle` (guaranteed to have an `accessToken`), auto-
 * refreshing via the refresh token if the access token is absent. Throws
 * `AUTH_ERROR` (401) when neither token is available.
 */
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

/**
 * Higher-order helper that executes an authenticated API call.
 *
 * It:
 *  1. Ensures a valid access token exists (refreshing if needed).
 *  2. Calls `fn(accessToken, baseUrl)`.
 *  3. On a 401 response, attempts a single token refresh and retries the call.
 *  4. Re-throws any other errors unchanged.
 *
 * Use `runAuthAware` (below) as the call site wrapper â€” it simply delegates
 * to this function.
 */
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

/**
 * Opens https://www.facebook.com/friends/birthdays in a background tab (or focuses an
 * existing one) and resolves once the page is ready.
 *
 * If no such tab is currently open, the returned promise is rejected. This
 * enforces the invariant that automation only runs when the user has already
 * opened the birthdays page, and avoids returning `null` to signal failure.
 */
async function openOrFocusFacebookBirthdaysTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(
      { url: ['*://*.facebook.com/birthdays*', '*://*.facebook.com/friends/birthdays*'] },
      (tabs) => {
        const preferredTab =
          tabs.find((tab) => tab.active && tab.id !== undefined) ??
          tabs.find((tab) => tab.id !== undefined);

        if (preferredTab?.id !== undefined) {
          resolve(preferredTab);
        } else {
          // Do NOT auto-open a Facebook tab â€” requires user to have the page open
          reject(new Error('Facebook birthdays tab is not open; user action is required.'));
        }
      },
    );
  });
}

/**
 * Short-lived in-memory cache for templates and posts fetched from the backend.
 * Prevents redundant API calls when automation scans run in quick succession
 * (e.g. alarm fires while a manual scan is still in progress).
 * TTL: 5 minutes â€” long enough to skip duplicate fetches, short enough that
 * template edits are picked up promptly.
 */
const _BACKEND_DATA_TTL_MS = 5 * 60 * 1000;
let _cachedBackendData: {
  templates: MessageTemplate[];
  posts: Post[];
  fetchedAt: number;
} | null = null;

function invalidateBackendDataCache(): void {
  _cachedBackendData = null;
}

async function fetchBackendDataCached(): Promise<{
  templates: MessageTemplate[];
  posts: Post[];
}> {
  if (_cachedBackendData && Date.now() - _cachedBackendData.fetchedAt < _BACKEND_DATA_TTL_MS) {
    return _cachedBackendData;
  }
  const [templates, posts] = (await Promise.all([
    runAuthAware((accessToken, url) => listMessageTemplates(url, accessToken)),
    runAuthAware((accessToken, url) => listPosts(url, accessToken)),
  ])) as [MessageTemplate[], Post[]];
  _cachedBackendData = { templates, posts, fetchedAt: Date.now() };
  return _cachedBackendData;
}

/**
 * Core automation scan: fetches templates / posts / contacts from the backend,
 * groups them by days_in_advance, opens the Facebook birthdays page, and
 * dispatches the full automation payload to the content script.
 */
let automationScanInFlight: Promise<{ success: boolean }> | null = null;

/**
 * Starts one automation scan without keeping the popup's runtime message port
 * open for the full scan. This prevents the popup from timing out while the
 * background worker fetches backend data, waits for Facebook, and dispatches
 * the content-script run.
 *
 * Repeated clicks while a scan is already running reuse the existing run
 * instead of starting a second overlapping automation.
 */
function startAutomationScan(): void {
  if (automationScanInFlight) {
    logger.info('Automation scan request ignored because a scan is already running');
    return;
  }

  automationScanInFlight = handleAutomationScan()
    .catch(async (error) => {
      logger.error('Unhandled automation scan failure', error);
      await addActivityLogEntry(
        'error',
        `Automation scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      notifyAutomationFailed(
        error instanceof Error ? error.message : 'Automation scan failed unexpectedly.',
      );
      return { success: false };
    })
    .finally(() => {
      automationScanInFlight = null;
    });
}

async function handleAutomationScan(): Promise<{ success: boolean }> {
  // Fail-safe checks before proceeding
  if (await isEmergencyStopActive()) {
    logger.warn('handleAutomationScan: emergency stop is active, skipping');
    await addActivityLogEntry('warning', 'Automation scan skipped â€” emergency stop active');
    notifyAutomationPaused('Emergency stop is active. Automation has been paused.');
    return { success: false };
  }

  if (await isBackoffPaused()) {
    logger.warn('handleAutomationScan: backoff pause active, skipping');
    await addActivityLogEntry('warning', 'Automation scan skipped â€” failure backoff active');
    notifyAutomationPaused(
      'Automation is paused due to recent send failures. It will resume automatically.',
    );
    return { success: false };
  }

  const rateLimit = await checkRateLimit();
  if (!rateLimit.allowed) {
    logger.warn('handleAutomationScan: rate limit reached', rateLimit.reason);
    await addActivityLogEntry('warning', `Automation scan skipped â€” ${rateLimit.reason}`);
    notifyAutomationPaused(rateLimit.reason ?? 'Rate limit reached.');
    return { success: false };
  }

  // Reset abort flag for this new run
  await setShouldAbort(false);

  // Save checkpoint for crash recovery
  await saveCheckpoint({
    startedAt: new Date().toISOString(),
    phase: 'scanning',
    targetCount: 0,
    sentCount: 0,
  });

  let templates: MessageTemplate[] = [];
  let posts: Post[] = [];

  try {
    ({ templates, posts } = await fetchBackendDataCached());
  } catch (err) {
    logger.error('handleAutomationScan: failed to fetch backend data', err);
    notifyAutomationFailed(
      'Could not fetch data from the server. Check your connection and try again.',
    );
    await clearCheckpoint();
    return { success: false };
  }

  const sentToday = await getSentToday();

  const config = await getAutomationConfig();

  // Current-day templates (days_in_advance === 0) â€” used for friends scraped from
  // the Facebook birthday feed live during this run.
  const currentDayTemplates = templates.filter((t) => t.days_in_advance === 0);

  // Warn when template diversity is too low â€” repeated identical messages are a
  // detectable automation signal.
  if (templates.length > 0 && templates.length < 3) {
    await addActivityLogEntry(
      'warning',
      `Low template diversity (${templates.length} template${
        templates.length === 1 ? '' : 's'
      }). ` +
        'Create at least 3â€“5 templates to avoid sending identical messages that Facebook can flag.',
    );
  }

  // Advance templates (days_in_advance > 0) â€” matched to scraped friends by the content script.
  const advanceTemplates = templates.filter((t) => t.days_in_advance > 0);

  // Follow-up templates (days_in_advance < 0) â€” matched to scraped friends by the content script.
  const followUpTemplates = templates.filter((t) => t.days_in_advance < 0);

  const payload: AutomationRunPayload = {
    currentDayTemplates,
    advanceTemplates,
    followUpTemplates,
    posts,
    sentToday,
    maxMessages: config.maxMessages ?? 0,
  };

  const tab = await openOrFocusFacebookBirthdaysTab();
  if (!tab || !tab.id) {
    logger.info(
      'handleAutomationScan: no Facebook birthdays tab open â€” user must navigate to facebook.com/friends/birthdays',
    );
    await addActivityLogEntry('info', 'Automation skipped â€” no Facebook birthdays tab open');
    notifyAutomationFailed(
      'No Facebook birthdays tab open. Please navigate to facebook.com/friends/birthdays.',
    );
    await clearCheckpoint();
    return { success: false };
  }

  // Wait for the tab to finish loading (cap at 15 s).
  await new Promise<void>((resolve) => {
    if (tab.status === 'complete') {
      setTimeout(resolve, 1500);
      return;
    }
    const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });

  // Send automation payload to the content script.  If the content script
  // doesn't respond (e.g. page navigated and the script wasn't re-injected),
  // re-inject it via chrome.scripting.executeScript and retry once.
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'automation.runFull', payload });
  } catch {
    logger.warn('Content script not reachable â€” re-injecting and retrying');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      // Brief delay for script initialisation
      await new Promise((r) => setTimeout(r, 1500));
      await chrome.tabs.sendMessage(tab.id, { type: 'automation.runFull', payload });
    } catch (retryErr) {
      logger.error('Re-injection failed â€” aborting automation', retryErr);
      await addActivityLogEntry('error', 'Could not reach content script after re-injection');
      notifyAutomationFailed('Content script could not be loaded on the Facebook tab.');
      await clearCheckpoint();
      return { success: false };
    }
  }
  await updateLastCheck();
  const totalTemplates =
    currentDayTemplates.length + advanceTemplates.length + followUpTemplates.length;
  // Update checkpoint to 'dispatched' phase, then clear once done
  await saveCheckpoint({
    startedAt: new Date().toISOString(),
    phase: 'dispatched',
    targetCount: totalTemplates,
    sentCount: 0,
  });
  await clearCheckpoint();
  notifyAutomationComplete(totalTemplates);
  return { success: true };
}

type BackgroundResponse =
  | TokenResponse
  | UserProfile
  | TemplateSegment[]
  | TemplateSegment
  | { status: string }
  | SubscriptionStatus
  | CheckoutSessionResponse
  | BillingPortalResponse
  | AutomationConfig
  | QueuedMessage
  | QueuedMessage[]
  | MessageHistoryItem[]
  | MessageHistoryPage
  | DashboardStats
  | Post
  | Post[]
  | UserImage
  | UserImage[]
  | SMTPConfig
  | BirthdayConfig
  | BirthdayConfig[]
  | MessageTemplate
  | MessageTemplate[]
  | { success: boolean }
  | { backendUrl: string }
  | { wsUrl: string; token: string }
  | PreferredHours
  | { message: string }
  | ServerRateLimitStatus
  | Contact
  | Contact[]
  | { deleted: number }
  | MessageGroup
  | MessageGroup[]
  | null;

/**
 * Process a UserProfile response from the backend to split the `name` field
 * into `firstName` and `lastName` for the frontend.
 */
function processUserProfile(profile: UserProfile): UserProfile {
  if (profile.name) {
    const parts = profile.name.trim().split(/\s+/);
    if (parts.length === 1) {
      return {
        ...profile,
        firstName: parts[0],
        lastName: '',
      };
    } else {
      const lastName = parts.pop() || '';
      const firstName = parts.join(' ');
      return {
        ...profile,
        firstName,
        lastName,
      };
    }
  }
  return profile;
}

/** Convenience wrapper used throughout `handleMessage` to call an API function with automatic auth. */
async function runAuthAware<T>(call: AuthCall<T>): Promise<T> {
  return withAuth(call);
}

async function handleMessage(message: BackgroundMessage): Promise<BackgroundResponse> {
  const baseUrl = await getBackendUrl();
  switch (message.type) {
    case 'auth.register': {
      const result = await register(baseUrl, message.payload);
      return result;
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
      const tokens = await getTokens();
      if (tokens.refreshToken) {
        try {
          await revokeToken(baseUrl, tokens.refreshToken);
        } catch (error) {
          logger.warn('Failed to revoke refresh token during logout', error);
        }
      }
      await clearTokens();
      return { message: 'logged out' };
    }
    case 'auth.requestPasswordReset': {
      return requestPasswordReset(baseUrl, message.payload);
    }
    case 'auth.requestEmailVerification': {
      return requestEmailVerification(baseUrl, message.payload);
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
      const profile = await runAuthAware((accessToken, url) => me(url, accessToken));
      return processUserProfile(profile);
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
    case 'images.uploadFile': {
      const payload = message.payload as import('../api/client').UploadImageFilePayload;
      return runAuthAware((accessToken, url) => uploadImageFile(url, accessToken, payload));
    }
    case 'subscription.status': {
      return runAuthAware((accessToken, url) => subscriptionStatus(url, accessToken));
    }
    case 'subscription.checkout': {
      return runAuthAware((accessToken, url) =>
        createBTCPayCheckout(
          url,
          accessToken,
          message.payload.plan,
          message.payload.payment_method,
          message.payload.idempotency_key,
        ),
      );
    }
    case 'subscription.cancel': {
      return runAuthAware((accessToken, url) => cancelSubscription(url, accessToken));
    }
    case 'subscription.reactivate': {
      return runAuthAware((accessToken, url) => reactivateSubscription(url, accessToken));
    }
    case 'subscription.changePlan': {
      return runAuthAware((accessToken, url) =>
        changeSubscriptionPlan(url, accessToken, message.payload),
      );
    }
    case 'subscription.billingPortal': {
      return runAuthAware((accessToken, url) => getBillingPortal(url, accessToken));
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
    case 'automation.getConfig': {
      return getAutomationConfig();
    }
    case 'automation.setEnabled': {
      if (message.payload.enabled) {
        // alarms is optional_permissions â€” request it before scheduling
        await requestAlarmsPermission();
      }
      return updateAutomationEnabled(message.payload.enabled);
    }
    case 'automation.setInterval': {
      return updateCheckInterval(message.payload.minutes);
    }
    case 'automation.setMaxMessages': {
      return updateMaxMessages(message.payload.max);
    }
    case 'automation.getPreferredHours': {
      return getPreferredHours();
    }
    case 'automation.setPreferredHours': {
      await setPreferredHours(message.payload);
      return { success: true };
    }
    case 'automation.clearSentToday': {
      await clearSentToday();
      return { success: true };
    }
    case 'automation.recordSent': {
      await addToSentToday(message.payload.friendId);
      return { success: true };
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
      return runAuthAware((accessToken, url) =>
        listMessageHistory(url, accessToken, message.payload ?? {}),
      );
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
    case 'dashboard.getConfigs': {
      return runAuthAware((accessToken, url) => listBirthdayConfigs(url, accessToken));
    }
    case 'dashboard.toggleConfig': {
      await runAuthAware((accessToken, url) =>
        toggleBirthdayConfig(url, accessToken, message.payload.id, message.payload.enabled),
      );
      return { success: true };
    }
    case 'automation.scanFacebook': {
      // Return immediately to the popup so Chrome does not close the message
      // channel while the longer scan continues in the background.
      startAutomationScan();
      return { success: true };
    }
    case 'rateLimit.status': {
      return runAuthAware((accessToken, url) => getServerRateLimitStatus(url, accessToken));
    }
    case 'rateLimit.record': {
      return runAuthAware((accessToken, url) => recordServerSend(url, accessToken));
    }

    // Contact handlers â€” full CRUD enabled.
    case 'contacts.list': {
      return runAuthAware((accessToken, url) =>
        listContacts(url, accessToken, message.payload?.updatedSince),
      );
    }

    case 'contacts.create': {
      return runAuthAware((accessToken, url) => createContact(url, accessToken, message.payload));
    }
    case 'contacts.update': {
      const { id, ...payload } = message.payload;
      return runAuthAware((accessToken, url) => updateContact(url, accessToken, id, payload));
    }
    case 'contacts.delete': {
      return runAuthAware((accessToken, url) =>
        deleteContact(url, accessToken, message.payload.id),
      );
    }
    case 'contacts.bulkCreate': {
      return runAuthAware((accessToken, url) =>
        bulkCreateContacts(url, accessToken, message.payload.contacts),
      );
    }
    case 'contacts.cleanup': {
      return runAuthAware((accessToken, url) => cleanupGarbledContacts(url, accessToken));
    }

    case 'contacts.scrapeFromFacebook': {
      // Find the Facebook birthdays tab and ask the content script to scrape contacts
      const tabs = await chrome.tabs.query({
        url: ['*://*.facebook.com/birthdays*', '*://*.facebook.com/friends/birthdays*'],
      });
      const tab = tabs[0];
      if (!tab?.id) {
        throw new ApiError(404, {
          detail:
            'No Facebook birthdays tab open. Please open facebook.com/friends/birthdays first.',
        });
      }
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'contacts.scrapeFromPage' });
        return result as unknown as BackgroundResponse;
      } catch {
        // Content script not reachable â€” try re-injecting
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        await new Promise((r) => setTimeout(r, 1500));
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'contacts.scrapeFromPage' });
        return result as unknown as BackgroundResponse;
      }
    }

    // Post handlers
    case 'posts.list': {
      return runAuthAware((accessToken, url) => listPosts(url, accessToken));
    }
    case 'posts.create': {
      const result = await runAuthAware((accessToken, url) =>
        createPost(url, accessToken, message.payload),
      );
      invalidateBackendDataCache();
      return result;
    }
    case 'posts.update': {
      const { id, ...payload } = message.payload;
      const result = await runAuthAware((accessToken, url) =>
        updatePost(url, accessToken, id, payload),
      );
      invalidateBackendDataCache();
      return result;
    }
    case 'posts.delete': {
      const result = await runAuthAware((accessToken, url) =>
        deletePost(url, accessToken, message.payload.id),
      );
      invalidateBackendDataCache();
      return result;
    }
    // Message Group handlers
    case 'messageGroups.list': {
      return runAuthAware((accessToken, url) => listMessageGroups(url, accessToken));
    }
    case 'messageGroups.create': {
      return runAuthAware((accessToken, url) =>
        createMessageGroup(url, accessToken, message.payload),
      );
    }
    case 'messageGroups.update': {
      const { id, ...payload } = message.payload;
      return runAuthAware((accessToken, url) => updateMessageGroup(url, accessToken, id, payload));
    }
    case 'messageGroups.delete': {
      return runAuthAware((accessToken, url) =>
        deleteMessageGroup(url, accessToken, message.payload.id),
      );
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
      return runAuthAware((accessToken, url) =>
        updateSMTPConfig(url, accessToken, message.payload),
      );
    }
    // User Profile handlers
    case 'auth.updateProfile': {
      const profile = await runAuthAware((accessToken, url) =>
        updateUserProfile(url, accessToken, message.payload),
      );
      return processUserProfile(profile);
    }
    // Message Template handlers
    case 'messageTemplates.list': {
      return runAuthAware((accessToken, url) =>
        listMessageTemplates(url, accessToken, message.gender),
      );
    }
    case 'messageTemplates.create': {
      return runAuthAware((accessToken, url) =>
        createMessageTemplate(url, accessToken, message.payload),
      );
    }
    case 'messageTemplates.get': {
      return runAuthAware((accessToken, url) =>
        getMessageTemplate(url, accessToken, message.payload.id),
      );
    }
    case 'messageTemplates.update': {
      const { id, ...payload } = message.payload;
      return runAuthAware((accessToken, url) =>
        updateMessageTemplate(url, accessToken, id, payload),
      );
    }
    case 'messageTemplates.delete': {
      await runAuthAware((accessToken, url) =>
        deleteMessageTemplate(url, accessToken, message.payload.id),
      );
      return { status: 'deleted' };
    }
    case 'auth.deleteAccount': {
      await runAuthAware((accessToken, url) => deleteUserAccount(url, accessToken));
      await clearTokens();
      return { message: 'Account deleted successfully' };
    }
    // Fail-safe message handlers
    case 'failsafe.getEmergencyStop': {
      return (await getEmergencyStopState()) as unknown as BackgroundResponse;
    }
    case 'failsafe.triggerEmergencyStop': {
      const hours = message.payload?.cooldownHours ?? 24;
      await triggerEmergencyStop(hours);
      await setShouldAbort(true);
      // Disable automation
      await updateAutomationEnabled(false);
      return { success: true };
    }
    case 'failsafe.clearEmergencyStop': {
      await clearEmergencyStop();
      await setShouldAbort(false);
      return { success: true };
    }
    case 'failsafe.getActivityLog': {
      return (await getActivityLog()) as unknown as BackgroundResponse;
    }
    case 'failsafe.clearActivityLog': {
      await clearActivityLog();
      return { success: true };
    }
    case 'failsafe.getRateLimits': {
      return (await getRateLimitSummary()) as unknown as BackgroundResponse;
    }
    case 'failsafe.getConfirmationMode': {
      const mode = await getConfirmationMode();
      return { mode } as unknown as BackgroundResponse;
    }
    case 'failsafe.setConfirmationMode': {
      await setConfirmationMode(message.payload.mode as ConfirmationMode);
      return { success: true };
    }
    default:
      throw new ApiError(400, { detail: 'Unknown action' });
  }
}

chrome.runtime.onMessage.addListener((request: BackgroundMessage, sender, sendResponse) => {
  // Security: reject messages from other extensions or unexpected senders
  if (sender.id !== chrome.runtime.id) {
    sendResponse({
      success: false,
      error: { status: 403, message: 'Forbidden: sender not recognized' },
    });
    return false;
  }

  logger.debug('Received message:', request.type);

  // Hard 15 s guard â€” guarantees sendResponse is always called so Chrome never
  // silently kills the MV3 service worker while we hold a `return true` port.
  // (Chrome can kill the SW at ~30 s even with an open sendResponse handle in
  // some versions; capping at 15 s keeps us well inside that window.)
  let responded = false;
  const guardTimer = setTimeout(() => {
    if (!responded) {
      responded = true;
      logger.warn(`Message handler timed out after 15 s: ${request.type}`);
      sendResponse({
        success: false,
        error: { status: 504, message: 'Background message timed out' },
      });
    }
  }, 15_000);

  handleMessage(request)
    .then((response) => {
      if (!responded) {
        responded = true;
        clearTimeout(guardTimer);
        logger.success('Message handled successfully:', request.type);
        sendResponse({ success: true, data: response });
      }
    })
    .catch((error) => {
      if (!responded) {
        responded = true;
        clearTimeout(guardTimer);
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
        } else if (error instanceof TypeError) {
          // TypeError is thrown by fetch() for network-level failures (no connection,
          // SSL error, missing host_permissions, etc.)  Use status 0 so the popup
          // can distinguish a connectivity problem from a server error.
          sendResponse({
            success: false,
            error: {
              status: 0,
              message: error.message,
            },
          });
        } else if (error instanceof Error && error.message.startsWith('Request timed out')) {
          // AbortController fired inside client.ts after the 10 s fetch timeout.
          // Reclassify as a network error (status 0) rather than a server error.
          sendResponse({
            success: false,
            error: {
              status: 0,
              message: error.message,
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

// Chrome Alarms listener for automation (alarms is an optional permission)
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'birthday-check-alarm') {
      const config = await getAutomationConfig();
      if (!config.enabled) return;

      // Skip automation outside the user's preferred hours window
      const prefHours = await getPreferredHours();
      if (!isWithinPreferredHours(prefHours)) {
        logger.info(
          `Alarm fired outside preferred hours (${prefHours.startHour}:00â€“${prefHours.endHour}:00) â€” skipping`,
        );
        return;
      }

      // Only run if user has an active Facebook tab open (no background automation)
      const fbTabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
      if (fbTabs.length === 0) {
        logger.info('Alarm fired but no active Facebook tab â€” skipping automation');
        return;
      }

      await handleAutomationScan();
    }
  });
}

// Initialize automation on startup
async function initializeAutomation(): Promise<void> {
  // Check for stale checkpoint from a previously interrupted run
  const staleCheckpoint = await checkForStaleCheckpoint();
  if (staleCheckpoint) {
    logger.warn(
      'Found stale automation checkpoint â€” previous run was interrupted',
      staleCheckpoint,
    );
    await addActivityLogEntry(
      'warning',
      `Previous automation run interrupted during "${staleCheckpoint.phase}" phase (started ${staleCheckpoint.startedAt}). Cleaned up.`,
    );
    await clearCheckpoint();
  }

  const config = await getAutomationConfig();
  if (config.enabled && chrome.alarms) {
    // Reschedule alarms on extension startup
    await chrome.alarms.clear('birthday-check-alarm');
    await chrome.alarms.create('birthday-check-alarm', {
      delayInMinutes: config.checkInterval,
      periodInMinutes: config.checkInterval,
    });
  }
}

void initializeAutomation();

// Listen for extension install/update to show post-update notification
chrome.runtime.onInstalled.addListener(handleInstallOrUpdate);
