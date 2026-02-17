import type { BackgroundMessage } from './messages';

interface BackgroundResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    status: number;
    message: string;
    data?: unknown;
  };
}

export function sendExtensionMessage<T>(message: BackgroundMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BackgroundResponse<T>) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from background script'));
        return;
      }
      if (response.success) {
        resolve(response.data as T);
      } else {
        const err = new Error(response.error?.message ?? 'Unknown error');
        (err as any).status = response.error?.status;
        (err as any).data = response.error?.data;
        reject(err);
      }
    });
  });
}
