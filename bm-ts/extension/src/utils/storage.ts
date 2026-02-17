export const STORAGE_KEYS = {
  accessToken: 'bm_access_token',
  refreshToken: 'bm_refresh_token',
  backendUrl: 'bm_backend_url',
};

export type TokenBundle = {
  accessToken?: string;
  refreshToken?: string;
};

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

export async function clearTokens(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([STORAGE_KEYS.accessToken, STORAGE_KEYS.refreshToken], () =>
      resolve(),
    );
  });
}

export async function getBackendUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.backendUrl], (data) => {
      resolve(data[STORAGE_KEYS.backendUrl] || 'http://localhost:8000');
    });
  });
}

export async function setBackendUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.backendUrl]: url }, () => resolve());
  });
}
