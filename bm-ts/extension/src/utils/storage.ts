/**
 * storage.ts â€” Chrome extension storage helpers.
 *
 * Abstracts all `chrome.storage.local` interactions into typed async functions so
 * that the rest of the codebase never has to deal with the raw callback API directly.
 *
 * Stored keys:
 *   bm_access_token   â€” JWT access token returned by the backend
 *   bm_refresh_token  â€” JWT refresh token (long-lived)
 *   bm_backend_url    â€” user-configurable backend URL (defaults to localhost:8000)
 */

/** Centralised map of `chrome.storage.local` key names used by this extension. */
const IS_PRODUCTION = import.meta.env.PROD;
const PRODUCTION_BACKEND_URL = 'https://api-v2.birthdaymessaging.io';
const DEVELOPMENT_BACKEND_URL = 'http://localhost:8000';
const DEFAULT_BACKEND_URL = (import.meta.env.VITE_API_BASE_URL || (IS_PRODUCTION ? PRODUCTION_BACKEND_URL : DEVELOPMENT_BACKEND_URL)).replace(/\/+$/, '');

export const STORAGE_KEYS = {
  accessToken: 'bm_access_token',
  refreshToken: 'bm_refresh_token',
  backendUrl: 'bm_backend_url',
  onboardingComplete: 'bm_onboarding_complete',
};

/** Access and refresh token pair.  Both fields are optional because either may be absent after a partial auth state. */
export type TokenBundle = {
  accessToken?: string;
  refreshToken?: string;
};

/** Reads the stored access and refresh tokens from `chrome.storage.local`. */
export async function getTokens(): Promise<TokenBundle> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.accessToken, STORAGE_KEYS.refreshToken], (data) => {
      resolve({
        accessToken: data[STORAGE_KEYS.accessToken],
        refreshToken: data[STORAGE_KEYS.refreshToken],
      });
    });
  });
}

/** Persists a token bundle to `chrome.storage.local`.  Either field may be `undefined` to leave it unchanged (the set operation only writes the provided keys). */
export async function saveTokens(tokens: TokenBundle): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.accessToken]: tokens.accessToken,
        [STORAGE_KEYS.refreshToken]: tokens.refreshToken,
      },
      () => resolve(),
    );
  });
}

/** Removes both the access token and refresh token from storage (logout / account deletion). */
export async function clearTokens(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.accessToken, STORAGE_KEYS.refreshToken], () =>
      resolve(),
    );
  });
}

/**
 * Returns the configured backend base URL.
 * Falls back to `http://localhost:8000` when the user has not set a custom URL,
 * which covers local development without any extra configuration.
 * Trailing slashes are stripped so that path concatenation in client.ts always
 * produces a single `/` (e.g. avoids `//auth/login` if the stored value has a trailing slash).
 */
export async function getBackendUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.backendUrl], (data) => {
      const stored = data[STORAGE_KEYS.backendUrl] as string | undefined;
      const raw = IS_PRODUCTION && stored && isAllowedDevUrl(stored) ? DEFAULT_BACKEND_URL : stored || DEFAULT_BACKEND_URL;
      resolve(raw.replace(/\/+$/, ''));
    });
  });
}

/**
 * Validates that a backend URL uses an allowed scheme.
 * HTTPS is always allowed; HTTP is only allowed for localhost (development).
 * Returns `true` if the URL is safe to use.
 */
function isAllowedSslipIoHostname(hostname: string): boolean {
  // Accept any valid hostname that ends with .sslip.io â€” covers both the
  // standard NNN-NNN-NNN-NNN.sslip.io format (dashes) and multi-level
  // subdomain formats like prefix.NNN.NNN.NNN.NNN.sslip.io (dots + prefix).
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.sslip\.io$/i.test(hostname);
}

function isAllowedDevHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || isAllowedSslipIoHostname(hostname);
}

function isAllowedDevUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && isAllowedDevHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function isValidBackendUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    if (!IS_PRODUCTION && parsed.protocol === 'http:' && isAllowedDevHostname(parsed.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Persists a custom backend URL so the extension points to the right server instance.
 *  Validates the URL scheme first â€” only HTTPS or HTTP to localhost, 127.0.0.1, or *.sslip.io are accepted for development.
 *  Trailing slashes are stripped so that path concatenation in client.ts always produces a single `/`. */
export async function setBackendUrl(url: string): Promise<void> {
  const normalized = url.replace(/\/+$/, '');
  if (!isValidBackendUrl(normalized)) {
    throw new Error(
      'Invalid backend URL: only https:// URLs (or http://localhost, http://127.0.0.1, and http://*.sslip.io for development) are allowed',
    );
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.backendUrl]: normalized }, () => resolve());
  });
}

/**
 * Returns whether the user has completed (or skipped) the onboarding wizard.
 * Defaults to `false` so the wizard always shows for new installs.
 */
export async function getOnboardingComplete(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.onboardingComplete], (data) => {
      resolve(Boolean(data[STORAGE_KEYS.onboardingComplete]));
    });
  });
}

/** Marks the onboarding wizard as complete so it is not shown again. */
export async function setOnboardingComplete(value: boolean): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.onboardingComplete]: value }, () => resolve());
  });
}
