export class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    const detail =
      typeof data === 'object' && data !== null && 'detail' in data
        ? (data as { detail?: string }).detail
        : undefined;
    super(detail ?? 'API request failed');
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

async function request<T>(
  baseUrl: string,
  path: string,
  method: HttpMethod,
  body?: JsonValue,
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return data as T;
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface TemplateSegment {
  id: string;
  segment_type: 'GREETING' | 'BODY' | 'CLOSING';
  content: string;
  label?: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  name?: string;
  timezone?: string;
}

export type SegmentType = TemplateSegment['segment_type'];

export interface SubscriptionStatus {
  is_active: boolean;
  plan?: 'monthly' | 'yearly';
  current_period_end?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export interface CheckoutSessionRequest {
  plan: 'monthly' | 'yearly';
  success_url: string;
  cancel_url: string;
}

export interface CheckoutSessionResponse {
  checkout_url: string;
}

export async function register(baseUrl: string, payload: RegisterPayload): Promise<TokenResponse> {
  return request<TokenResponse>(baseUrl, '/auth/register', 'POST', payload as unknown as JsonValue);
}

export async function login(baseUrl: string, payload: RegisterPayload): Promise<TokenResponse> {
  return request<TokenResponse>(baseUrl, '/auth/login', 'POST', payload as unknown as JsonValue);
}

export async function refreshToken(baseUrl: string, refresh_token: string): Promise<TokenResponse> {
  return request<TokenResponse>(baseUrl, '/auth/refresh', 'POST', { refresh_token });
}

export async function me(baseUrl: string, accessToken: string): Promise<UserProfile> {
  return request(baseUrl, '/auth/me', 'GET', undefined, accessToken);
}

export async function listTemplates(
  baseUrl: string,
  accessToken: string,
  segmentType?: SegmentType,
): Promise<TemplateSegment[]> {
  const path = segmentType ? `/templates/?segment_type=${segmentType}` : '/templates/';
  return request(baseUrl, path, 'GET', undefined, accessToken);
}

export async function createTemplate(
  baseUrl: string,
  accessToken: string,
  segmentType: SegmentType,
  content: string,
  label?: string,
): Promise<TemplateSegment> {
  return request(
    baseUrl,
    '/templates/',
    'POST',
    { segment_type: segmentType, content, label },
    accessToken,
  );
}

export async function updateTemplate(
  baseUrl: string,
  accessToken: string,
  id: string,
  content?: string,
  label?: string,
): Promise<TemplateSegment> {
  return request(baseUrl, `/templates/${id}`, 'PUT', { content, label }, accessToken);
}

export async function deleteTemplate(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/templates/${id}`, 'DELETE', undefined, accessToken);
}

export async function subscriptionStatus(
  baseUrl: string,
  accessToken: string,
): Promise<SubscriptionStatus> {
  return request(baseUrl, '/subscription/status', 'GET', undefined, accessToken);
}

export async function createCheckoutSession(
  baseUrl: string,
  accessToken: string,
  payload: CheckoutSessionRequest,
): Promise<CheckoutSessionResponse> {
  return request(
    baseUrl,
    '/subscription/create-checkout-session',
    'POST',
    payload as unknown as JsonValue,
    accessToken,
  );
}

export interface RequestPasswordResetPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export async function requestPasswordReset(
  baseUrl: string,
  payload: RequestPasswordResetPayload,
): Promise<{ message: string }> {
  return request(baseUrl, '/auth/request-password-reset', 'POST', payload as unknown as JsonValue);
}

export async function resetPassword(
  baseUrl: string,
  payload: ResetPasswordPayload,
): Promise<{ message: string }> {
  return request(baseUrl, '/auth/reset-password', 'POST', payload as unknown as JsonValue);
}

export async function changePassword(
  baseUrl: string,
  accessToken: string,
  payload: ChangePasswordPayload,
): Promise<{ message: string }> {
  return request(
    baseUrl,
    '/auth/change-password',
    'POST',
    payload as unknown as JsonValue,
    accessToken,
  );
}

export interface BirthdaySchedule {
  id: string;
  days_before: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSchedulePayload {
  days_before: number;
  enabled?: boolean;
}

export interface UpdateSchedulePayload {
  enabled?: boolean;
}

export async function listSchedules(
  baseUrl: string,
  accessToken: string,
): Promise<BirthdaySchedule[]> {
  return request(baseUrl, '/api/schedules/', 'GET', undefined, accessToken);
}

export async function createSchedule(
  baseUrl: string,
  accessToken: string,
  payload: CreateSchedulePayload,
): Promise<BirthdaySchedule> {
  return request(baseUrl, '/api/schedules/', 'POST', payload as unknown as JsonValue, accessToken);
}

export async function updateSchedule(
  baseUrl: string,
  accessToken: string,
  id: string,
  payload: UpdateSchedulePayload,
): Promise<BirthdaySchedule> {
  return request(baseUrl, `/api/schedules/${id}`, 'PUT', payload as unknown as JsonValue, accessToken);
}

export async function deleteSchedule(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/api/schedules/${id}`, 'DELETE', undefined, accessToken);
}

export interface QueuedMessage {
  id: string;
  friend_name: string;
  friend_profile_url: string;
  birthday_date: string;
  scheduled_send_time: string;
  message_content: string;
  status: 'pending' | 'processing' | 'failed';
  created_at: string;
  error_message?: string;
}

export interface UpdateQueuedMessagePayload {
  message_content?: string;
  scheduled_send_time?: string;
}

export async function listQueuedMessages(
  baseUrl: string,
  accessToken: string,
): Promise<QueuedMessage[]> {
  return request(baseUrl, '/api/messages/queue', 'GET', undefined, accessToken);
}

export async function updateQueuedMessage(
  baseUrl: string,
  accessToken: string,
  id: string,
  payload: UpdateQueuedMessagePayload,
): Promise<QueuedMessage> {
  return request(
    baseUrl,
    `/api/messages/queue/${id}`,
    'PUT',
    payload as unknown as JsonValue,
    accessToken,
  );
}

export async function cancelQueuedMessage(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/api/messages/queue/${id}`, 'DELETE', undefined, accessToken);
}

export async function retryQueuedMessage(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<QueuedMessage> {
  return request(baseUrl, `/api/messages/queue/${id}/retry`, 'POST', undefined, accessToken);
}

export interface MessageHistoryItem {
  id: string;
  friend_name: string;
  friend_profile_url: string;
  birthday_date: string;
  message_content: string;
  sent_at: string;
  status: 'sent' | 'delivered' | 'failed';
  error_message?: string;
}

export async function listMessageHistory(
  baseUrl: string,
  accessToken: string,
): Promise<MessageHistoryItem[]> {
  return request(baseUrl, '/api/messages/history', 'GET', undefined, accessToken);
}

export async function deleteMessageHistory(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/api/messages/history/${id}`, 'DELETE', undefined, accessToken);
}

export interface DashboardStats {
  total_messages_sent: number;
  messages_sent_today: number;
  messages_sent_this_week: number;
  messages_sent_this_month: number;
  success_rate: number;
  friends_with_upcoming_birthdays: number;
  queued_messages: number;
  automation_enabled: boolean;
  next_scheduled_check?: string;
}

export async function getDashboardStats(
  baseUrl: string,
  accessToken: string,
): Promise<DashboardStats> {
  return request(baseUrl, '/api/dashboard/stats', 'GET', undefined, accessToken);
}

// ========== Contact Management ==========
export interface Contact {
  id: string;
  name: string;
  facebook_profile_url: string;
  birthday: string;
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactPayload {
  name: string;
  facebook_profile_url: string;
  birthday: string;
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  notes?: string;
}

export interface UpdateContactPayload {
  name?: string;
  facebook_profile_url?: string;
  birthday?: string;
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  notes?: string;
}

export async function listContacts(
  baseUrl: string,
  accessToken: string,
): Promise<Contact[]> {
  return request(baseUrl, '/api/contacts/', 'GET', undefined, accessToken);
}

export async function createContact(
  baseUrl: string,
  accessToken: string,
  payload: CreateContactPayload,
): Promise<Contact> {
  return request(baseUrl, '/api/contacts/', 'POST', payload as unknown as JsonValue, accessToken);
}

export async function updateContact(
  baseUrl: string,
  accessToken: string,
  id: string,
  payload: UpdateContactPayload,
): Promise<Contact> {
  return request(baseUrl, `/api/contacts/${id}`, 'PUT', payload as unknown as JsonValue, accessToken);
}

export async function deleteContact(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/api/contacts/${id}`, 'DELETE', undefined, accessToken);
}

export async function bulkCreateContacts(
  baseUrl: string,
  accessToken: string,
  contacts: CreateContactPayload[],
): Promise<Contact[]> {
  return request(baseUrl, '/api/contacts/bulk', 'POST', contacts as unknown as JsonValue, accessToken);
}

// ========== Message Groups ==========
export interface MessageGroup {
  id: string;
  name: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  segment_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateMessageGroupPayload {
  name: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  segment_ids: string[];
}

export interface UpdateMessageGroupPayload {
  name?: string;
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  segment_ids?: string[];
}

export async function listMessageGroups(
  baseUrl: string,
  accessToken: string,
): Promise<MessageGroup[]> {
  return request(baseUrl, '/api/message-groups/', 'GET', undefined, accessToken);
}

export async function createMessageGroup(
  baseUrl: string,
  accessToken: string,
  payload: CreateMessageGroupPayload,
): Promise<MessageGroup> {
  return request(baseUrl, '/api/message-groups/', 'POST', payload as unknown as JsonValue, accessToken);
}

export async function updateMessageGroup(
  baseUrl: string,
  accessToken: string,
  id: string,
  payload: UpdateMessageGroupPayload,
): Promise<MessageGroup> {
  return request(baseUrl, `/api/message-groups/${id}`, 'PUT', payload as unknown as JsonValue, accessToken);
}

export async function deleteMessageGroup(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/api/message-groups/${id}`, 'DELETE', undefined, accessToken);
}

// ========== Posts ==========
export interface Post {
  id: string;
  content: string;
  image_url?: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePostPayload {
  content: string;
  image_url?: string;
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  is_default?: boolean;
}

export interface UpdatePostPayload {
  content?: string;
  image_url?: string;
  gender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  is_default?: boolean;
}

export async function listPosts(
  baseUrl: string,
  accessToken: string,
): Promise<Post[]> {
  return request(baseUrl, '/api/posts/', 'GET', undefined, accessToken);
}

export async function createPost(
  baseUrl: string,
  accessToken: string,
  payload: CreatePostPayload,
): Promise<Post> {
  return request(baseUrl, '/api/posts/', 'POST', payload as unknown as JsonValue, accessToken);
}

export async function updatePost(
  baseUrl: string,
  accessToken: string,
  id: string,
  payload: UpdatePostPayload,
): Promise<Post> {
  return request(baseUrl, `/api/posts/${id}`, 'PUT', payload as unknown as JsonValue, accessToken);
}

export async function deletePost(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/api/posts/${id}`, 'DELETE', undefined, accessToken);
}

// ========== Images ==========
export interface UserImage {
  id: string;
  url: string;
  filename: string;
  size: number;
  created_at: string;
}

export interface CreateImagePayload {
  url: string;
  filename: string;
  size: number;
}

export async function listImages(
  baseUrl: string,
  accessToken: string,
): Promise<UserImage[]> {
  return request(baseUrl, '/api/images', 'GET', undefined, accessToken);
}

export async function createImage(
  baseUrl: string,
  accessToken: string,
  payload: CreateImagePayload,
): Promise<UserImage> {
  return request(baseUrl, '/api/images/upload', 'POST', payload as unknown as JsonValue, accessToken);
}

export interface UploadImageFilePayload {
  filename: string;
  data: string;  // base64 data URL
  size: number;  // decoded byte count
}

export async function uploadImageFile(
  baseUrl: string,
  accessToken: string,
  payload: UploadImageFilePayload,
): Promise<UserImage> {
  return request(baseUrl, '/api/images/upload-file', 'POST', payload as unknown as JsonValue, accessToken);
}

export async function deleteImage(
  baseUrl: string,
  accessToken: string,
  id: string,
): Promise<{ status: string }> {
  return request(baseUrl, `/api/images/${id}`, 'DELETE', undefined, accessToken);
}

// ========== SMTP Settings ==========
export interface SMTPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  use_tls: boolean;
  from_email: string;
  from_name?: string;
}

export interface UpdateSMTPConfigPayload {
  host: string;
  port: number;
  username: string;
  password: string;
  use_tls: boolean;
  from_email: string;
  from_name?: string;
}

export async function getSMTPConfig(
  baseUrl: string,
  accessToken: string,
): Promise<SMTPConfig | null> {
  return request(baseUrl, '/smtp/config', 'GET', undefined, accessToken);
}

export async function updateSMTPConfig(
  baseUrl: string,
  accessToken: string,
  payload: UpdateSMTPConfigPayload,
): Promise<SMTPConfig> {
  return request(baseUrl, '/smtp/config', 'PUT', payload as unknown as JsonValue, accessToken);
}

// ========== User Profile Management ==========
export interface UpdateUserProfilePayload {
  name?: string;
  timezone?: string;
}

export async function updateUserProfile(
  baseUrl: string,
  accessToken: string,
  payload: UpdateUserProfilePayload,
): Promise<UserProfile> {
  return request(baseUrl, '/auth/profile', 'PUT', payload as unknown as JsonValue, accessToken);
}

export async function deleteUserAccount(
  baseUrl: string,
  accessToken: string,
): Promise<{ message: string }> {
  return request(baseUrl, '/auth/account', 'DELETE', undefined, accessToken);
}

// ========== Message Templates ==========
export interface MessageTemplate {
  id: string;
  user_id: string;
  title: string;
  greeting: string;
  sentiment: string;
  closing: string;
  image_url: string | null;
  days_in_advance: number;
  gender: 'all' | 'male' | 'female';
  created_at: string;
  updated_at: string;
}

export interface CreateMessageTemplatePayload {
  title: string;
  greeting: string;
  sentiment: string;
  closing: string;
  image_url?: string | null;
  days_in_advance?: number;
  gender?: 'all' | 'male' | 'female';
}

export interface UpdateMessageTemplatePayload {
  title?: string;
  greeting?: string;
  sentiment?: string;
  closing?: string;
  image_url?: string | null;
  days_in_advance?: number;
  gender?: 'all' | 'male' | 'female';
}

export async function createMessageTemplate(
  baseUrl: string,
  accessToken: string,
  payload: CreateMessageTemplatePayload,
): Promise<MessageTemplate> {
  return request(baseUrl, '/api/message-templates', 'POST', payload as unknown as JsonValue, accessToken);
}

export async function listMessageTemplates(
  baseUrl: string,
  accessToken: string,
  gender?: string,
): Promise<MessageTemplate[]> {
  const query = gender ? `?gender=${gender}` : '';
  return request(baseUrl, `/api/message-templates${query}`, 'GET', undefined, accessToken);
}

export async function getMessageTemplate(
  baseUrl: string,
  accessToken: string,
  templateId: string,
): Promise<MessageTemplate> {
  return request(baseUrl, `/api/message-templates/${templateId}`, 'GET', undefined, accessToken);
}

export async function updateMessageTemplate(
  baseUrl: string,
  accessToken: string,
  templateId: string,
  payload: UpdateMessageTemplatePayload,
): Promise<MessageTemplate> {
  return request(baseUrl, `/api/message-templates/${templateId}`, 'PUT', payload as unknown as JsonValue, accessToken);
}

export async function deleteMessageTemplate(
  baseUrl: string,
  accessToken: string,
  templateId: string,
): Promise<void> {
  return request(baseUrl, `/api/message-templates/${templateId}`, 'DELETE', undefined, accessToken);
}

// ========== Birthday Configs ==========
export interface BirthdayConfig {
  id: string;
  mode: 'advance' | 'normal' | 'followup';
  days_offset: number;
  message_group_id?: string | null;
  post_id?: string | null;
  gender_filter: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'ALL';
  archive_enabled: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function listBirthdayConfigs(
  baseUrl: string,
  accessToken: string,
): Promise<BirthdayConfig[]> {
  return request(baseUrl, '/api/birthday-configs', 'GET', undefined, accessToken);
}

export async function toggleBirthdayConfig(
  baseUrl: string,
  accessToken: string,
  id: string,
  enabled: boolean,
): Promise<BirthdayConfig> {
  return request(
    baseUrl,
    `/api/birthday-configs/${id}/toggle`,
    'PATCH',
    { enabled },
    accessToken,
  );
}
