import {
  CheckoutSessionRequest,
  SegmentType,
  CreateContactPayload,
  UpdateContactPayload,
  CreateMessageGroupPayload,
  UpdateMessageGroupPayload,
  CreatePostPayload,
  UpdatePostPayload,
  CreateImagePayload,
  UpdateSMTPConfigPayload,
  UpdateUserProfilePayload,
  CreateMessageTemplatePayload,
  UpdateMessageTemplatePayload,
  MessageTemplate,
  Contact,
  Post,
} from '../api/client';

/**
 * Payload dispatched from background → content script to run the full automation loop.
 * currentDayTemplates: templates for days_in_advance === 0 (birthday today).
 * advanceEntries: templates for days_in_advance > 0 paired with the matching contacts.
 * followUpEntries: templates for days_in_advance < 0 paired with the matching contacts.
 * posts: timeline posts available for today.
 * contacts: full contacts list (used for gender lookup + sync).
 * sentToday: profile URLs already processed today (dedup guard).
 * maxMessages: cap per run (0 = unlimited).
 */
export interface AutomationRunPayload {
  currentDayTemplates: MessageTemplate[];
  advanceEntries: Array<{ template: MessageTemplate; contacts: Contact[] }>;
  followUpEntries: Array<{ template: MessageTemplate; contacts: Contact[] }>;
  posts: Post[];
  contacts: Contact[];
  sentToday: string[];
  maxMessages: number;
}

/** Messages sent from background service worker → content script. */
export type ContentScriptMessage =
  | { type: 'automation.scan' }
  | { type: 'automation.runFull'; payload: AutomationRunPayload };

export type BackgroundMessage =
  // Auth messages
  | { type: 'auth.register'; payload: { email: string; password: string } }
  | { type: 'auth.login'; payload: { email: string; password: string } }
  | { type: 'auth.refresh' }
  | { type: 'auth.logout' }
  | { type: 'auth.me' }
  | { type: 'auth.requestPasswordReset'; payload: { email: string } }
  | { type: 'auth.resetPassword'; payload: { token: string; new_password: string } }
  | { type: 'auth.changePassword'; payload: { currentPassword: string; newPassword: string } }
  | { type: 'auth.updateProfile'; payload: UpdateUserProfilePayload }
  | { type: 'auth.deleteAccount' }
  // Template messages
  | { type: 'templates.list'; segmentType?: SegmentType }
  | {
      type: 'templates.create';
      payload: { segmentType: SegmentType; content: string; label?: string };
    }
  | { type: 'templates.update'; payload: { id: string; content?: string; label?: string } }
  | { type: 'templates.delete'; payload: { id: string } }
  // Subscription messages
  | { type: 'subscription.status' }
  | { type: 'subscription.checkout'; payload: CheckoutSessionRequest }
  // Config messages
  | { type: 'config.getBackendUrl' }
  | { type: 'config.setBackendUrl'; payload: { backendUrl: string } }
  | { type: 'config.getWSConfig' }
  // Schedule messages
  | { type: 'schedules.list' }
  | { type: 'schedules.create'; payload: { days_before: number; enabled?: boolean } }
  | { type: 'schedules.update'; payload: { id: string; enabled?: boolean } }
  | { type: 'schedules.delete'; payload: { id: string } }
  // Automation messages
  | { type: 'automation.scanFacebook' }
  | { type: 'automation.getConfig' }
  | { type: 'automation.setEnabled'; payload: { enabled: boolean } }
  | { type: 'automation.setInterval'; payload: { minutes: number } }
  | { type: 'automation.setMaxMessages'; payload: { max: number } }
  | { type: 'automation.clearSentToday' }
  | { type: 'automation.recordSent'; payload: { friendId: string; friendName: string } }
  // Message queue messages
  | { type: 'messages.listQueue' }
  | {
      type: 'messages.updateQueued';
      payload: { id: string; message_content?: string; scheduled_send_time?: string };
    }
  | { type: 'messages.cancelQueued'; payload: { id: string } }
  | { type: 'messages.retryQueued'; payload: { id: string } }
  | { type: 'messages.listHistory' }
  | { type: 'messages.deleteHistory'; payload: { id: string } }
  // Dashboard messages
  | { type: 'dashboard.getStats' }
  | { type: 'dashboard.getConfigs' }
  | { type: 'dashboard.toggleConfig'; payload: { id: string; enabled: boolean } }
  // Contact messages
  | { type: 'contacts.list' }
  | { type: 'contacts.create'; payload: CreateContactPayload }
  | { type: 'contacts.update'; payload: { id: string } & UpdateContactPayload }
  | { type: 'contacts.delete'; payload: { id: string } }
  | { type: 'contacts.bulkCreate'; payload: CreateContactPayload[] }
  // Message Group messages
  | { type: 'messageGroups.list' }
  | { type: 'messageGroups.create'; payload: CreateMessageGroupPayload }
  | { type: 'messageGroups.update'; payload: { id: string } & UpdateMessageGroupPayload }
  | { type: 'messageGroups.delete'; payload: { id: string } }
  // Post messages
  | { type: 'posts.list' }
  | { type: 'posts.create'; payload: CreatePostPayload }
  | { type: 'posts.update'; payload: { id: string } & UpdatePostPayload }
  | { type: 'posts.delete'; payload: { id: string } }
  // Image messages
  | { type: 'images.list' }
  | { type: 'images.create'; payload: CreateImagePayload }
  | { type: 'images.uploadFile'; payload: { filename: string; data: string; size: number } }
  | { type: 'images.delete'; payload: { id: string } }
  // SMTP messages
  | { type: 'smtp.getConfig' }
  | { type: 'smtp.updateConfig'; payload: UpdateSMTPConfigPayload }
  // Message Template messages
  | { type: 'messageTemplates.list'; gender?: string }
  | { type: 'messageTemplates.create'; payload: CreateMessageTemplatePayload }
  | { type: 'messageTemplates.get'; payload: { id: string } }
  | { type: 'messageTemplates.update'; payload: { id: string } & UpdateMessageTemplatePayload }
  | { type: 'messageTemplates.delete'; payload: { id: string } };
