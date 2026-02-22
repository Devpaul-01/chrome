
# API Endpoints Documentation - New Features

> **UPDATE (Feb 14, 2026): ALL PHASE 2 ENDPOINTS ARE NOW ACTIVE**

This document describes the new features added in Phase 2. All routers, schemas, and frontend components are now implemented and registered:
- ✅ **Database models are defined** in `app/db/models.py`
- ✅ **Routers are registered** in `app/main.py`
- ✅ **Endpoints are fully functional and return correct responses**

**Backend-frontend integration is complete.**
See [SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md Section 10](../SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md#10-production-gaps--future-work) 

**For ACTIVE endpoints, see below.**

---

## Message Groups (ACTIVE)

### Create Message Group
```http
POST /api/message-groups
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Casual Birthday Wishes",
  "gender": "NEUTRAL",
  "segment_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "Casual Birthday Wishes",
  "gender": "NEUTRAL",
  "segment_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "created_at": "2026-02-06T10:00:00Z",
  "updated_at": "2026-02-06T10:00:00Z"
}
```

### List Message Groups
```http
GET /api/message-groups?gender=MALE
Authorization: Bearer <token>
```

**Query Parameters:**
- `gender` (optional): Filter by gender (MALE, FEMALE, NEUTRAL, ALL)

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Casual Birthday Wishes",
    "gender": "NEUTRAL",
    "segment_ids": ["uuid-1", "uuid-2"],
    "created_at": "2026-02-06T10:00:00Z",
    "updated_at": "2026-02-06T10:00:00Z"
  }
]
```

### Get Message Group
```http
GET /api/message-groups/{group_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` or `404 Not Found`

### Update Message Group
```http
PUT /api/message-groups/{group_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Name",
  "gender": "MALE",
  "segment_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response:** `200 OK`

### Delete Message Group
```http
DELETE /api/message-groups/{group_id}
Authorization: Bearer <token>
```

**Response:** `204 No Content`

---

## Posts (ACTIVE)

### Create Post
```http
POST /api/posts
Content-Type: application/json
Authorization: Bearer <token>

{
  "content": "Happy birthday {First_Name}! 🎉 [Image]",
  "gender": "FEMALE",
  "image_url": "https://example.com/image.jpg",
  "label": "Casual Female Birthday Post"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "content": "Happy birthday {First_Name}! 🎉 [Image]",
  "gender": "FEMALE",
  "image_url": "https://example.com/image.jpg",
  "label": "Casual Female Birthday Post",
  "created_at": "2026-02-06T10:00:00Z",
  "updated_at": "2026-02-06T10:00:00Z"
}
```

### List Posts
```http
GET /api/posts?gender=FEMALE
Authorization: Bearer <token>
```

**Query Parameters:**
- `gender` (optional): Filter by gender (MALE, FEMALE, NEUTRAL, ALL)

**Response:** `200 OK`

### Get Post
```http
GET /api/posts/{post_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` or `404 Not Found`

### Update Post
```http
PUT /api/posts/{post_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "content": "Updated content",
  "gender": "MALE",
  "label": "Updated label"
}
```

**Response:** `200 OK`

### Delete Post
```http
DELETE /api/posts/{post_id}
Authorization: Bearer <token>
```

**Response:** `204 No Content`

---

## Images (ACTIVE)

### Upload Image from URL
```http
POST /api/images/upload
Content-Type: application/json
Authorization: Bearer <token>

{
  "url": "https://example.com/image.jpg"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "url": "https://example.com/image.jpg",
  "filename": "image.jpg",
  "size": 0,
  "uploaded_at": "2026-02-06T10:00:00Z"
}
```

### Upload Image File (Base64)
```http
POST /api/images/upload-file
Content-Type: application/json
Authorization: Bearer <token>

{
  "filename": "birthday.jpg",
  "data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "size": 524288
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "filename": "birthday.jpg",
  "size": 524288,
  "uploaded_at": "2026-02-06T10:00:00Z"
}
```

**Validation:**
- Max file size: 5MB (5,242,880 bytes)
- Data must be valid base64 encoded

### List Images
```http
GET /api/images
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "url": "https://example.com/image.jpg",
    "filename": "image.jpg",
    "size": 524288,
    "uploaded_at": "2026-02-06T10:00:00Z"
  }
]
```

### Get Image
```http
GET /api/images/{image_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` or `404 Not Found`

### Delete Image
```http
DELETE /api/images/{image_id}
Authorization: Bearer <token>
```

**Response:** `204 No Content`

---

## Birthday Configurations (ACTIVE)

### Create Birthday Config
```http
POST /api/birthday-configs
Content-Type: application/json
Authorization: Bearer <token>

{
  "mode": "EARLY",
  "days_offset": -3,
  "message_group_id": "uuid",
  "post_id": "uuid",
  "gender_filter": "FEMALE",
  "archive_enabled": true,
  "enabled": true
}
```

**Validation Rules:**
- `mode: "EARLY"` → `days_offset` must be -7 to -1
- `mode: "ON_DAY"` → `days_offset` must be 0
- `mode: "BELATED"` → `days_offset` must be 1 to 7

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "mode": "EARLY",
  "days_offset": -3,
  "message_group_id": "uuid",
  "post_id": "uuid",
  "gender_filter": "FEMALE",
  "archive_enabled": true,
  "enabled": true,
  "created_at": "2026-02-06T10:00:00Z",
  "updated_at": "2026-02-06T10:00:00Z"
}
```

### List Birthday Configs
```http
GET /api/birthday-configs?mode=EARLY&enabled=true
Authorization: Bearer <token>
```

**Query Parameters:**
- `mode` (optional): Filter by mode (`EARLY`, `ON_DAY`, `BELATED`)
- `enabled` (optional): Filter by enabled status (`true`, `false`)

**Response:** `200 OK`

### Get Birthday Config
```http
GET /api/birthday-configs/{config_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` or `404 Not Found`

### Update Birthday Config
```http
PUT /api/birthday-configs/{config_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "days_offset": -5,
  "gender_filter": "MALE",
  "archive_enabled": false,
  "enabled": true
}
```

**Response:** `200 OK`

### Toggle Birthday Config
```http
PATCH /api/birthday-configs/{config_id}/toggle
Content-Type: application/json
Authorization: Bearer <token>

{
  "enabled": false
}
```

**Response:** `200 OK`

### Delete Birthday Config
```http
DELETE /api/birthday-configs/{config_id}
Authorization: Bearer <token>
```

**Response:** `204 No Content`

---

## Contacts (ACTIVE)

### Create Contact
```http
POST /api/contacts
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Jane Smith",
  "facebook_id": "1234567890",
  "birthday": "1990-07-15",
  "gender": "FEMALE",
  "notes": "Friend from college"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "Jane Smith",
  "facebook_id": "1234567890",
  "birthday": "1990-07-15",
  "gender": "FEMALE",
  "notes": "Friend from college",
  "created_at": "2026-02-06T10:00:00Z",
  "updated_at": "2026-02-06T10:00:00Z"
}
```

### Bulk Create Contacts
```http
POST /api/contacts/bulk
Content-Type: application/json
Authorization: Bearer <token>

[
  { "name": "Jane Smith", "facebook_id": "111", "birthday": "1990-07-15", "gender": "FEMALE" },
  { "name": "John Doe",   "facebook_id": "222", "birthday": "1985-03-22", "gender": "MALE" }
]
```

**Response:** `201 Created` — array of created contacts

### List Contacts
```http
GET /api/contacts
Authorization: Bearer <token>
```

**Response:** `200 OK` — array of contacts

### Get Contact
```http
GET /api/contacts/{contact_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` or `404 Not Found`

### Update Contact
```http
PUT /api/contacts/{contact_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Jane Doe",
  "gender": "FEMALE"
}
```

**Response:** `200 OK`

### Delete Contact
```http
DELETE /api/contacts/{contact_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` — `{ "status": "deleted" }`

---

## SMTP Configuration (ACTIVE)

### Get SMTP Config
```http
GET /smtp/config
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "host": "smtp.gmail.com",
  "port": 587,
  "username": "user@gmail.com",
  "use_tls": true,
  "from_address": "user@gmail.com",
  "created_at": "2026-02-06T10:00:00Z",
  "updated_at": "2026-02-06T10:00:00Z"
}
```

**Note:** Password field is not returned in responses.

### Update SMTP Config
```http
PUT /smtp/config
Content-Type: application/json
Authorization: Bearer <token>

{
  "host": "smtp.gmail.com",
  "port": 587,
  "username": "user@gmail.com",
  "password": "app-specific-password",
  "use_tls": true,
  "from_address": "user@gmail.com"
}
```

**Response:** `200 OK`

> ⚠️ **Security Note:** Passwords are currently stored as plaintext (TEXT column in PostgreSQL). Encrypt at rest before production deployment.

---

## Account Management (ACTIVE)

### Update Profile
```http
PUT /auth/profile
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Alice Johnson",
  "timezone": "America/New_York"
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "alice@example.com",
  "metadata": {
    "name": "Alice Johnson",
    "timezone": "America/New_York"
  }
}
```

### Delete Account
```http
DELETE /auth/account
Authorization: Bearer <token>
```

**Response:** `200 OK` — `{ "status": "deleted" }`

> ⚠️ **Warning:** This permanently deletes the user and all associated data (cascade delete).

---

## Message Templates (ACTIVE)

These are complete pre-built message templates (distinct from individual `TemplateSegments`).

### Create Message Template
```http
POST /api/message-templates
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Warm Female Birthday",
  "content": "Happy birthday {First_Name}! Wishing you a wonderful day! 🎂",
  "gender": "FEMALE"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "Warm Female Birthday",
  "content": "Happy birthday {First_Name}! Wishing you a wonderful day! 🎂",
  "gender": "FEMALE",
  "created_at": "2026-02-06T10:00:00Z",
  "updated_at": "2026-02-06T10:00:00Z"
}
```

### List Message Templates
```http
GET /api/message-templates?gender=FEMALE
Authorization: Bearer <token>
```

**Query Parameters:**
- `gender` (optional): Filter by gender (`MALE`, `FEMALE`, `NEUTRAL`, `ALL`)

**Response:** `200 OK` — array of message templates

### Get Message Template
```http
GET /api/message-templates/{template_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` or `404 Not Found`

### Update Message Template
```http
PUT /api/message-templates/{template_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Template",
  "content": "Hey {First_Name}, happy birthday! 🎉"
}
```

**Response:** `200 OK`

### Delete Message Template
```http
DELETE /api/message-templates/{template_id}
Authorization: Bearer <token>
```

**Response:** `200 OK` — `{ "status": "deleted" }`

---

## Error Responses

All endpoints may return the following error responses:

### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

### 404 Not Found
```json
{
  "detail": "Resource not found"
}
```

### 400 Bad Request
```json
{
  "detail": "Validation error message"
}
```

### 422 Unprocessable Entity
```json
{
  "detail": [
    {
      "loc": ["body", "field_name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

---

## Keyword Replacement

Posts and message templates support dynamic keywords replaced at send time by `resolveKeywords()` in `utils/message.ts`:

| Keyword | Replacement | Notes |
|---------|-------------|-------|
| `[Tag Person]` | Friend's full name | Exact string used in DM templates |
| `[Today]` | Localised date string (e.g. "February 21") | Uses `toLocaleDateString('en-US', {month:'long', day:'numeric'})` |
| `[Image]` | *(stripped / empty string)* | Images are attached separately; this placeholder is removed from text |
| `{First_Name}` | Friend's first name | Legacy-style merge tag — supported by backend docs but resolved separately |
| `{Last_Name}` | Friend's last name | As above |

**Example (DM assembled from MessageTemplate):**
```
greeting:  "Hey [Tag Person]!"
sentiment: "Wishing you an amazing birthday on [Today]."
closing:   "Hope this year is your best yet! [Image]"

Output: "Hey John! Wishing you an amazing birthday on February 21. Hope this year is your best yet!"
```

---

## Automation Extension Messages

The extension background service worker exposes additional message types for controlling the automation pipeline. These are sent via `chrome.runtime.sendMessage()` from the popup (not HTTP endpoints).

### `automation.scanFacebook`
Triggers a full automation run: fetches templates/posts/contacts, groups by `days_in_advance`, opens `facebook.com/birthdays`, dispatches `automation.runFull` to the content script.

### `automation.getConfig`
Returns the current `AutomationConfig` from `chrome.storage.local`:
```json
{
  "enabled": true,
  "checkInterval": 60,
  "lastCheck": "2026-02-21T10:00:00.000Z",
  "nextCheck": "2026-02-21T11:00:00.000Z",
  "maxMessages": 0
}
```

### `automation.setEnabled`
Payload: `{ enabled: boolean }` — enables/disables scheduled automation.

### `automation.setInterval`
Payload: `{ minutes: number }` (minimum 30) — sets how often the alarm fires.

### `automation.setMaxMessages`
Payload: `{ max: number }` — caps messages per run. `0` = unlimited.

### `automation.clearSentToday`
No payload. Clears the `chrome.storage.local` deduplication list so all contacts can be processed again today.

### `automation.recordSent`
Payload: `{ friendId: string; friendName: string }` — sent from the content script after each successful DM. Adds `friendId` (profile URL or generated ID) to the sent-today list.

### `automation.runFull` (background → content script)
Dispatched from the background to the Facebook birthdays tab containing an `AutomationRunPayload`:
```typescript
{
  currentDayTemplates: MessageTemplate[];   // days_in_advance === 0
  advanceEntries: Array<{ template: MessageTemplate; contacts: Contact[] }>; // > 0
  followUpEntries: Array<{ template: MessageTemplate; contacts: Contact[] }>; // < 0
  posts: Post[];
  contacts: Contact[];     // full list for gender lookup + sync
  sentToday: string[];     // profile URLs already processed today
  maxMessages: number;     // 0 = unlimited
}
```

---

## Gender Enum Values

All gender fields use the following enum:
- `MALE` - Male friends only
- `FEMALE` - Female friends only
- `NEUTRAL` - Gender-neutral content
- `ALL` - All genders (for filters only)

---

## Testing with cURL

### Example: Create a message group
```bash
curl -X POST http://localhost:8000/api/message-groups \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Group",
    "gender": "NEUTRAL",
    "segment_ids": []
  }'
```

### Example: Upload an image
```bash
curl -X POST http://localhost:8000/api/images/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://picsum.photos/500/300"
  }'
```

### Example: List all posts
```bash
curl -X GET http://localhost:8000/api/posts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---


## Database Setup

**Note:** The endpoints documented above are now ACTIVE. The current database schema (applied via docker-compose) includes all tables for Phase 1 and Phase 2 features.

### Current Active Schema (13 Tables)

The active schema includes:
- users
- subscription_records
- template_segments
- birthday_schedules
- message_queue
- message_history
- password_reset_tokens
- birthday_configs
- posts
- message_groups
- user_images
- smtp_configs
- message_templates

### Current Development Setup (Docker)

The database schema is automatically created when running:

```bash
cd backend
docker-compose up -d
```

The schema is loaded from `ddl.sql` during container initialization. This creates all active tables.

---

## Notes

1. **Authentication Required**: All endpoints require a valid JWT Bearer token
2. **User Isolation**: Users can only access their own resources
3. **Cascade Deletes**: Deleting a user deletes all related resources
4. **Image Storage**: Currently stores URLs/base64 data; production should use cloud storage (S3, GCS, etc.)
5. **Archive Mode**: When enabled, prevents sending duplicate birthday messages across years
6. **Days Offset**: Negative for EARLY, zero for ON_DAY, positive for BELATED
7. **SMTP Passwords**: Currently stored as plaintext — must be encrypted before production deployment
8. **Send Birthday Message** (`POST /send-birthday-message`): Backend returns `{"status":"sent"}` stub. Actual sending is performed client-side by the content script automation pipeline (`runFullAutomation` in `content/index.ts`) — the API endpoint exists for logging/record-keeping only

## All Active Endpoints

### Phase 1 — Auth & Core
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`
- `GET /auth/me`, `PUT /auth/profile`, `DELETE /auth/account`
- `POST /auth/request-password-reset` *(rate-limited)*, `POST /auth/reset-password`, `POST /auth/change-password`
- `GET /templates/`, `POST /templates/`, `PUT /templates/{id}`, `DELETE /templates/{id}`
- `GET /subscription/status`, `POST /subscription/create-checkout-session`
- `POST /stripe/webhook`
- `GET /api/schedules`, `POST /api/schedules`, `PUT /api/schedules/{id}`, `DELETE /api/schedules/{id}`
- `GET /api/messages/queue`, `POST /api/messages/queue`, `PATCH /api/messages/queue/{id}`, `DELETE /api/messages/queue/{id}`, `POST /api/messages/queue/{id}/retry`
- `GET /api/messages/history`, `DELETE /api/messages/history/{id}`
- `GET /api/dashboard/stats`
- `WS  /ws` (WebSocket)

### Phase 2 — Extended Features
- `GET /api/contacts`, `POST /api/contacts`, `POST /api/contacts/bulk`, `GET /api/contacts/{id}`, `PUT /api/contacts/{id}`, `DELETE /api/contacts/{id}`
- `GET /api/message-groups`, `POST /api/message-groups`, `GET /api/message-groups/{id}`, `PUT /api/message-groups/{id}`, `DELETE /api/message-groups/{id}`
- `GET /api/posts`, `POST /api/posts`, `GET /api/posts/{id}`, `PUT /api/posts/{id}`, `DELETE /api/posts/{id}`
- `GET /api/images`, `POST /api/images/upload`, `POST /api/images/upload-file`, `GET /api/images/{id}`, `DELETE /api/images/{id}`
- `GET /api/birthday-configs`, `POST /api/birthday-configs`, `GET /api/birthday-configs/{id}`, `PUT /api/birthday-configs/{id}`, `PATCH /api/birthday-configs/{id}/toggle`, `DELETE /api/birthday-configs/{id}`
- `GET /smtp/config`, `PUT /smtp/config`
- `GET /api/message-templates`, `POST /api/message-templates`, `GET /api/message-templates/{id}`, `PUT /api/message-templates/{id}`, `DELETE /api/message-templates/{id}`

See [BACKEND_TESTING_GUIDE.md](../BACKEND_TESTING_GUIDE.md) for curl/PowerShell examples.

