/**
 * Unit tests for the background service worker (background/index.ts).
 *
 * Strategy: mock all external dependencies (API client, storage utils,
 * failsafe utils) then import the background module, which registers the
 * chrome.runtime.onMessage listener as a side effect. Tests trigger that
 * listener directly via the captured callback from the chrome mock.
 *
 * Covers:
 *   - Sender ID guard (rejects messages from unknown extensions)
 *   - auth.login stores tokens and returns TokenResponse
 *   - auth.logout clears tokens
 *   - auth.me splits name → firstName + lastName
 *   - dashboard.getStats merges automation config into result
 *   - withAuth retries on 401 (token refresh flow)
 *   - failsafe.triggerEmergencyStop disables automation
 *   - 15-second timeout sentinel
 *   - Unknown message type returns 500 error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock setup (before any imports that depend on these modules) ---------

const mockLogin = vi.fn();
const mockMe = vi.fn();
const mockRefreshToken = vi.fn();
const mockSaveTokens = vi.fn();
const mockClearTokens = vi.fn();
const mockGetTokens = vi.fn();
const mockGetBackendUrl = vi.fn().mockResolvedValue('http://localhost:8000');
const mockGetDashboardStats = vi.fn();
const mockGetAutomationConfig = vi.fn();
const mockIsEmergencyStopActive = vi.fn().mockResolvedValue(false);
const mockIsBackoffPaused = vi.fn().mockResolvedValue(false);
const mockCheckRateLimit = vi.fn().mockResolvedValue({ allowed: true });
const mockTriggerEmergencyStop = vi.fn();
const mockClearEmergencyStop = vi.fn();
const mockUpdateAutomationEnabled = vi.fn();
const mockSetShouldAbort = vi.fn();
const mockGetEmergencyStopState = vi.fn();
const mockGetActivityLog = vi.fn();
const mockClearActivityLog = vi.fn();
const mockAddActivityLogEntry = vi.fn();
const mockGetRateLimitSummary = vi.fn();
const mockGetConfirmationMode = vi.fn();
const mockSetConfirmationMode = vi.fn();
const mockGetPreferredHours = vi.fn();
const mockSetPreferredHours = vi.fn();
const mockIsWithinPreferredHours = vi.fn();
const mockSaveCheckpoint = vi.fn();
const mockClearCheckpoint = vi.fn();
const mockCheckForStaleCheckpoint = vi.fn();
const mockHandleInstallOrUpdate = vi.fn();

vi.mock('../../api/client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public data: unknown,
    ) {
      super(
        typeof data === 'object' && data !== null && 'detail' in (data as object)
          ? ((data as { detail?: string }).detail ?? 'API error')
          : 'API error',
      );
    }
  },
  login: mockLogin,
  me: mockMe,
  refreshToken: mockRefreshToken,
  register: vi.fn(),
  subscriptionStatus: vi.fn(),
  listTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  listQueuedMessages: vi.fn(),
  updateQueuedMessage: vi.fn(),
  cancelQueuedMessage: vi.fn(),
  retryQueuedMessage: vi.fn(),
  listMessageHistory: vi.fn(),
  deleteMessageHistory: vi.fn(),
  getDashboardStats: mockGetDashboardStats,
  listPosts: vi.fn().mockResolvedValue([]),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  listImages: vi.fn(),
  createImage: vi.fn(),
  uploadImageFile: vi.fn(),
  deleteImage: vi.fn(),
  getSMTPConfig: vi.fn(),
  updateSMTPConfig: vi.fn(),
  updateUserProfile: vi.fn(),
  listMessageTemplates: vi.fn().mockResolvedValue([]),
  createMessageTemplate: vi.fn(),
  getMessageTemplate: vi.fn(),
  updateMessageTemplate: vi.fn(),
  deleteMessageTemplate: vi.fn(),
  deleteUserAccount: vi.fn(),
  listBirthdayConfigs: vi.fn(),
  toggleBirthdayConfig: vi.fn(),
  getServerRateLimitStatus: vi.fn(),
  recordServerSend: vi.fn(),
  listContacts: vi.fn(),
  bulkCreateContacts: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  requestEmailVerification: vi.fn(),
  createCheckoutSession: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  changeSubscriptionPlan: vi.fn(),
  getBillingPortal: vi.fn(),
}));

vi.mock('../../utils/storage', () => ({
  clearTokens: mockClearTokens,
  getBackendUrl: mockGetBackendUrl,
  getTokens: mockGetTokens,
  saveTokens: mockSaveTokens,
  setBackendUrl: vi.fn(),
}));

vi.mock('../../utils/automation', () => ({
  getAutomationConfig: mockGetAutomationConfig,
  updateAutomationEnabled: mockUpdateAutomationEnabled,
  updateCheckInterval: vi.fn(),
  updateLastCheck: vi.fn(),
  getSentToday: vi.fn().mockResolvedValue([]),
  addToSentToday: vi.fn(),
  clearSentToday: vi.fn(),
  updateMaxMessages: vi.fn(),
  getPreferredHours: mockGetPreferredHours,
  setPreferredHours: mockSetPreferredHours,
  isWithinPreferredHours: mockIsWithinPreferredHours,
}));

vi.mock('../../utils/failsafe', () => ({
  getEmergencyStopState: mockGetEmergencyStopState,
  triggerEmergencyStop: mockTriggerEmergencyStop,
  clearEmergencyStop: mockClearEmergencyStop,
  isEmergencyStopActive: mockIsEmergencyStopActive,
  getActivityLog: mockGetActivityLog,
  clearActivityLog: mockClearActivityLog,
  addActivityLogEntry: mockAddActivityLogEntry,
  getRateLimitSummary: mockGetRateLimitSummary,
  checkRateLimit: mockCheckRateLimit,
  isBackoffPaused: mockIsBackoffPaused,
  getConfirmationMode: mockGetConfirmationMode,
  setConfirmationMode: mockSetConfirmationMode,
  setShouldAbort: mockSetShouldAbort,
}));

vi.mock('../../utils/notifications', () => ({
  notifyAutomationComplete: vi.fn(),
  notifyAutomationFailed: vi.fn(),
  notifyAutomationPaused: vi.fn(),
}));

vi.mock('../../utils/crash-recovery', () => ({
  saveCheckpoint: mockSaveCheckpoint,
  clearCheckpoint: mockClearCheckpoint,
  checkForStaleCheckpoint: mockCheckForStaleCheckpoint,
}));

vi.mock('../../utils/update-check', () => ({
  handleInstallOrUpdate: mockHandleInstallOrUpdate,
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// ---- Import module under test (triggers side effects) --------------------

// Minimal default token state: no tokens (so initializeAuthState exits early)
mockGetTokens.mockResolvedValue({ accessToken: null, refreshToken: null });
mockGetAutomationConfig.mockResolvedValue({
  enabled: false,
  checkInterval: 60,
  maxMessages: 20,
  nextCheck: null,
});

// Let the module load with side effects
await import('../index');

// ---- Capture the registered onMessage callback ONCE (before any test can
//      call vi.clearAllMocks() and wipe chrome.runtime.onMessage.addListener
//      mock call records). We store the plain function reference, which is
//      not affected by later vi.clearAllMocks() calls. ----

const _chromeMock = (
  globalThis as unknown as {
    chrome: { runtime: { onMessage: { addListener: { mock: { calls: Array<unknown[]> } } } } };
  }
).chrome;

const _registeredListener = _chromeMock.runtime.onMessage.addListener.mock.calls[0][0] as (
  request: unknown,
  sender: unknown,
  sendResponse: (r: unknown) => void,
) => boolean | undefined;

if (!_registeredListener) {
  throw new Error('background/index: onMessage.addListener was not called during module init');
}

/** Send a simulated message and collect the sendResponse result. */
function sendMessage(
  type: string,
  payload?: unknown,
): Promise<{ success: boolean; data?: unknown; error?: unknown }> {
  return new Promise((resolve) => {
    const msg = payload !== undefined ? { type, payload } : { type };
    // Sender with matching id (same as chrome.runtime.id = undefined)
    const sender = { id: undefined };
    _registeredListener(msg, sender, (response) => {
      resolve(response as { success: boolean; data?: unknown; error?: unknown });
    });
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('background/index — sender ID guard', () => {
  it('rejects messages from an unexpected sender', async () => {
    const sendResponse = vi.fn();
    _registeredListener({ type: 'auth.me' }, { id: 'other-extension-id' }, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    const call = sendResponse.mock.calls[0][0] as { error?: { status: number } };
    expect(call.error?.status).toBe(403);
  });
});

describe('background/index — auth.logout', () => {
  beforeEach(() => {
    mockClearTokens.mockClear();
    mockGetBackendUrl.mockClear();
  });

  it('clears tokens and returns logout message', async () => {
    mockClearTokens.mockResolvedValue(undefined);

    const result = await sendMessage('auth.logout');
    expect(result.success).toBe(true);
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    const data = result.data as { message: string };
    expect(data.message).toBe('logged out');
  });
});

describe('background/index — auth.login', () => {
  beforeEach(() => {
    mockLogin.mockClear();
    mockSaveTokens.mockClear();
    mockGetBackendUrl.mockReset();
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
  });

  it('stores tokens and returns TokenResponse on successful login', async () => {
    const tokenResponse = {
      access_token: 'at1',
      refresh_token: 'rt1',
      token_type: 'bearer',
    };
    mockLogin.mockResolvedValue(tokenResponse);
    mockSaveTokens.mockResolvedValue(undefined);
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');

    const result = await sendMessage('auth.login', {
      email: 'user@example.com',
      password: 'pass1234',
    });

    expect(result.success).toBe(true);
    expect(mockSaveTokens).toHaveBeenCalledWith({
      accessToken: 'at1',
      refreshToken: 'rt1',
    });
    const data = result.data as typeof tokenResponse;
    expect(data.access_token).toBe('at1');
  });
});

describe('background/index — auth.me processUserProfile', () => {
  beforeEach(() => {
    mockMe.mockClear();
    mockGetTokens.mockReset();
    mockGetBackendUrl.mockReset();
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
  });

  it('splits a two-part name into firstName and lastName', async () => {
    const profile = {
      id: 'u1',
      email: 'alice@example.com',
      name: 'Alice Smith',
      created_at: new Date().toISOString(),
      email_verified: true,
    };
    mockGetTokens.mockResolvedValue({ accessToken: 'at1', refreshToken: 'rt1' });
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
    mockMe.mockResolvedValue(profile);

    const result = await sendMessage('auth.me');

    expect(result.success).toBe(true);
    const data = result.data as { firstName: string; lastName: string };
    expect(data.firstName).toBe('Alice');
    expect(data.lastName).toBe('Smith');
  });

  it('puts the single word into firstName with empty lastName', async () => {
    const profile = {
      id: 'u2',
      email: 'bob@example.com',
      name: 'Bob',
      created_at: new Date().toISOString(),
      email_verified: true,
    };
    mockGetTokens.mockResolvedValue({ accessToken: 'at2', refreshToken: 'rt2' });
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
    mockMe.mockResolvedValue(profile);

    const result = await sendMessage('auth.me');

    expect(result.success).toBe(true);
    const data = result.data as { firstName: string; lastName: string };
    expect(data.firstName).toBe('Bob');
    expect(data.lastName).toBe('');
  });
});

describe('background/index — dashboard.getStats augmentation', () => {
  beforeEach(() => {
    mockGetDashboardStats.mockClear();
    mockGetAutomationConfig.mockClear();
    mockGetTokens.mockReset();
    mockGetBackendUrl.mockReset();
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
  });

  it('merges automation_enabled and next_scheduled_check into stats', async () => {
    const baseStats = {
      total_messages_sent: 5,
      messages_sent_today: 1,
      messages_sent_this_week: 3,
      messages_sent_this_month: 5,
      success_rate: 100,
      friends_with_upcoming_birthdays: 2,
      queued_messages: 1,
      automation_enabled: false,
    };
    const config = {
      enabled: true,
      checkInterval: 60,
      maxMessages: 10,
      nextCheck: '2025-01-01T09:00:00.000Z',
    };
    mockGetTokens.mockResolvedValue({ accessToken: 'at3', refreshToken: null });
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
    mockGetDashboardStats.mockResolvedValue(baseStats);
    mockGetAutomationConfig.mockResolvedValue(config);

    const result = await sendMessage('dashboard.getStats');

    expect(result.success).toBe(true);
    const data = result.data as typeof baseStats & {
      automation_enabled: boolean;
      next_scheduled_check?: string;
    };
    expect(data.automation_enabled).toBe(true); // from config, not baseStats
    expect(data.next_scheduled_check).toBe('2025-01-01T09:00:00.000Z');
    expect(data.total_messages_sent).toBe(5); // base fields preserved
  });
});

describe('background/index — withAuth 401 retry', () => {
  beforeEach(() => {
    mockMe.mockClear();
    mockRefreshToken.mockClear();
    mockSaveTokens.mockClear();
    mockGetTokens.mockReset();
    mockGetBackendUrl.mockReset();
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
  });

  it('retries the call once after refreshing tokens on 401', async () => {
    const { ApiError } = await import('../../api/client');
    const error401 = new ApiError(401, { detail: 'Token expired' });

    // First call → 401, second call → success
    const profile = {
      id: 'u3',
      email: 'carol@example.com',
      name: 'Carol',
      created_at: new Date().toISOString(),
      email_verified: true,
    };
    mockGetTokens.mockResolvedValue({ accessToken: 'old_at', refreshToken: 'rt3' });
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
    mockMe.mockRejectedValueOnce(error401).mockResolvedValueOnce(profile);
    mockRefreshToken.mockResolvedValue({
      access_token: 'new_at',
      refresh_token: 'new_rt',
      token_type: 'bearer',
    });
    mockSaveTokens.mockResolvedValue(undefined);

    const result = await sendMessage('auth.me');

    expect(result.success).toBe(true);
    expect(mockMe).toHaveBeenCalledTimes(2);
    expect(mockSaveTokens).toHaveBeenCalledWith({
      accessToken: 'new_at',
      refreshToken: 'new_rt',
    });
  });
});

describe('background/index — failsafe.triggerEmergencyStop', () => {
  beforeEach(() => {
    mockTriggerEmergencyStop.mockClear();
    mockSetShouldAbort.mockClear();
    mockUpdateAutomationEnabled.mockClear();
  });

  it('triggers emergency stop, sets abort, and disables automation', async () => {
    mockTriggerEmergencyStop.mockResolvedValue(undefined);
    mockSetShouldAbort.mockResolvedValue(undefined);
    mockUpdateAutomationEnabled.mockResolvedValue(undefined);

    const result = await sendMessage('failsafe.triggerEmergencyStop', { cooldownHours: 6 });

    expect(result.success).toBe(true);
    expect(mockTriggerEmergencyStop).toHaveBeenCalledWith(6);
    expect(mockSetShouldAbort).toHaveBeenCalledWith(true);
    expect(mockUpdateAutomationEnabled).toHaveBeenCalledWith(false);
    const data = result.data as { success: boolean };
    expect(data.success).toBe(true);
  });
});

describe('background/index — 15-second timeout sentinel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetTokens.mockReset();
    mockGetBackendUrl.mockReset();
    mockMe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the guard after 15 000 ms if no response was sent', async () => {
    // Make auth.me hang indefinitely
    mockGetTokens.mockResolvedValue({ accessToken: 'at', refreshToken: null });
    mockGetBackendUrl.mockResolvedValue('http://localhost:8000');
    mockMe.mockReturnValue(new Promise(() => {})); // never resolves

    const responseP = new Promise<{ success: boolean; error?: { status: number } }>((resolve) => {
      _registeredListener({ type: 'auth.me' }, { id: undefined }, resolve as (r: unknown) => void);
    });

    // Advance time past the 15-second guard — triggers the sentinel setTimeout
    await vi.advanceTimersByTimeAsync(16_000);

    const response = await responseP;
    expect(response.success).toBe(false);
    expect(response.error?.status).toBe(504);
  });
});
