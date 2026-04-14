/**
 * messages.ts — Discriminated-union message types for the Chrome MV3 message bus.
 *
 * Every message passed between the popup, content script, and background service
 * worker must be listed here.  Using a discriminated union (tagged by `type`)
 * gives full TypeScript narrowing inside `background/index.ts#handleMessage`
 * and at every `sendContentMessage` / `sendExtensionMessage` call site.
 *
 * Naming conventions:
 *   auth.*             — authentication / account management
 *   templates.*        — legacy template segments (greeting / body / closing)
 *   subscription.*     — Stripe subscription status & checkout
 *   config.*           — extension configuration (backend URL, WS config)
 *   schedules.*        — per-contact birthday schedule CRUD
 *   automation.*       — automation engine control & state
 *   messages.*         — queued-message & history management
 *   dashboard.*        — dashboard stats & birthday config
 *   contacts.*         — contact CRUD + Facebook scraper
 *   messageGroups.*    — message group CRUD
 *   posts.*            — timeline post CRUD
 *   images.*           — user image library CRUD + upload
 *   smtp.*             — SMTP send config
 *   messageTemplates.* — full message templates with days_in_advance support
 */

import {
  CheckoutSessionRequest,
  SegmentType,
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
  Post,
  ListHistoryParams,
  CreateContactPayload,
  UpdateContactPayload,
} from '../api/client';

/**
 * Payload dispatched from background → content script to run the full automation loop.
 * currentDayTemplates: templates for days_in_advance === 0 (birthday today).
 * advanceTemplates: templates for days_in_advance > 0 (sent before birthday).
 * followUpTemplates: templates for days_in_advance < 0 (sent after birthday).
 * posts: timeline posts available for today.
 * sentToday: profile URLs already processed today (dedup guard).
 * maxMessages: cap per run (0 = unlimited).
 */
export interface AutomationRunPayload {
  currentDayTemplates: MessageTemplate[];
  advanceTemplates: MessageTemplate[];
  followUpTemplates: MessageTemplate[];
  posts: Post[];
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
  | { type: 'auth.requestEmailVerification'; payload: { email: string } }
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
  | { type: 'subscription.cancel' }
  | { type: 'subscription.reactivate' }
  | { type: 'subscription.changePlan'; payload: { new_plan: 'monthly' | 'yearly' } }
  | { type: 'subscription.billingPortal' }
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
  | { type: 'automation.getPreferredHours' }
  | {
      type: 'automation.setPreferredHours';
      payload: { enabled: boolean; startHour: number; endHour: number };
    }
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
  | { type: 'messages.listHistory'; payload?: ListHistoryParams }
  | { type: 'messages.deleteHistory'; payload: { id: string } }
  // Dashboard messages
  | { type: 'dashboard.getStats' }
  | { type: 'dashboard.getConfigs' }
  | { type: 'dashboard.toggleConfig'; payload: { id: string; enabled: boolean } }
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
  | { type: 'messageTemplates.delete'; payload: { id: string } }
  // Fail-safe messages
  | { type: 'failsafe.getEmergencyStop' }
  | { type: 'failsafe.triggerEmergencyStop'; payload: { cooldownHours?: number } }
  | { type: 'failsafe.clearEmergencyStop' }
  | { type: 'failsafe.getActivityLog' }
  | { type: 'failsafe.clearActivityLog' }
  | { type: 'failsafe.getRateLimits' }
  | { type: 'failsafe.getConfirmationMode' }
  | { type: 'failsafe.setConfirmationMode'; payload: { mode: string } }
  | { type: 'rateLimit.status' }
  | { type: 'rateLimit.record' }
  // Contact message types — kept for type-safety of restored UI files.
  // Runtime handlers for list/create/update/delete are commented out in background/index.ts.
  | { type: 'contacts.list' }
  | { type: 'contacts.create'; payload: CreateContactPayload }
  | { type: 'contacts.update'; payload: UpdateContactPayload & { id: string } }
  | { type: 'contacts.delete'; payload: { id: string } }
  | { type: 'contacts.bulkCreate'; payload: { contacts: CreateContactPayload[] } }
  | { type: 'contacts.scrapeFromFacebook' };
