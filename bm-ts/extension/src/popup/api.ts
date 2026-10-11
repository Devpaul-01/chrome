import type { BackgroundMessage } from '../utils/messages';
import { sendExtensionMessage } from '../utils/bridge';

export function sendBackgroundMessage<T>(message: BackgroundMessage): Promise<T> {
  return sendExtensionMessage(message);
}
