/**
 * storage.ts — Chrome extension storage helpers.
 *
 * Abstracts all `chrome.storage.local` interactions into typed async functions so
 * that the rest of the codebase never has to deal with the raw callback API directly.
 *
 * Stored keys:
 *   bm_access_token   — JWT access token returned by the backend
 *   bm_refresh_token  — JWT refresh token (long-lived)
 *   bm_backend_url    — user-configurable backend URL (defaults to localhost:8000)
 */

/** Centralised map of `chrome.storage.local` key names used by this extension. */
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
 */
export async function getBackendUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.backendUrl], (data) => {
      resolve(data[STORAGE_KEYS.backendUrl] || 'http://localhost:8000');
    });
  });
}

/**
 * Validates that a backend URL uses an allowed scheme.
 * HTTPS is always allowed; HTTP is only allowed for localhost (development).
 * Returns `true` if the URL is safe to use.
 */
function isValidBackendUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    )
      return true;
    return false;
  } catch {
    return false;
  }
}

/** Persists a custom backend URL so the extension points to the right server instance.
 *  Validates the URL scheme first — only HTTPS or HTTP-to-localhost are accepted. */
export async function setBackendUrl(url: string): Promise<void> {
  if (!isValidBackendUrl(url)) {
    throw new Error(
      'Invalid backend URL: only https:// URLs (or http://localhost for development) are allowed',
    );
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.backendUrl]: url }, () => resolve());
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
