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
} from '../api/client';

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
