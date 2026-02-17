
# API Endpoints Documentation - New Features

> **UPDATE (Feb 14, 2026): ALL PHASE 2 ENDPOINTS ARE NOW ACTIVE**

This document describes the new features added in Phase 2. All routers, schemas, and frontend components are now implemented and registered:
- ✅ **Database models are defined** in `app/db/models.py`
- ✅ **Routers are registered** in `app/main.py`
- ✅ **Endpoints are fully functional and return correct responses**

**Backend-frontend integration is complete.**
See [SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md Section 9](../SYSTEM_ARCHITECTURE_ANALYSIS_bm-ts.md#9-unregistered-features--future-work) for historical context.

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
  "mode": "advance",
  "days_offset": -3,
  "message_group_id": "uuid",
  "post_id": "uuid",
  "gender_filter": "FEMALE",
  "archive_enabled": true,
  "enabled": true
}
```

**Validation Rules:**
- `mode: "advance"` → `days_offset` must be -7 to -1
- `mode: "normal"` → `days_offset` must be 0
- `mode: "followup"` → `days_offset` must be 1 to 7

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "mode": "advance",
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
GET /api/birthday-configs?mode=advance&enabled=true
Authorization: Bearer <token>
```

**Query Parameters:**
- `mode` (optional): Filter by mode (advance, normal, followup)
- `enabled` (optional): Filter by enabled status (true, false)

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

Posts and messages support dynamic keywords that are replaced at send time:

- `{First_Name}` - Friend's first name
- `{Last_Name}` - Friend's last name
- `{Today}` - Current date (formatted)
- `[Image]` - Random image from user's library

**Example:**
```
Input: "Happy birthday {First_Name}! Hope you have a great day. [Image]"
Output: "Happy birthday John! Hope you have a great day. https://example.com/image.jpg"
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

### Current Active Schema (11 Tables)

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

### Current Development Setup (Docker)

The database schema is automatically created when running:

```bash
cd backend
docker-compose up -d
```

The schema is loaded from `ddl.sql` during container initialization. This creates all active tables.

---

## Notes

⚠️ **REMINDER: These endpoints are NOT ACTIVE in the current system.**

When these features are activated, the following will apply:

1. **Authentication Required**: All endpoints require a valid JWT token
2. **User Isolation**: Users can only access their own resources
3. **Cascade Deletes**: Deleting a user deletes all related resources
4. **Image Storage**: Currently stores URLs/base64; production should use cloud storage (S3, GCS, etc.)
5. **Archive Mode**: When enabled, prevents sending duplicate birthday messages across years
6. **Days Offset**: Negative for advance, zero for normal, positive for followup

## Active Endpoints (Phase 1)

For documentation of currently active endpoints, refer to:
- **Authentication**: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`
- **Password Reset**: `POST /auth/request-password-reset`, `POST /auth/reset-password`, `POST /auth/change-password`
- **Templates**: `POST /templates/`, `GET /templates/`, `PUT /templates/{id}`, `DELETE /templates/{id}`
- **Subscriptions**: `GET /subscription/status`, `POST /subscription/create-checkout-session`
- **Schedules**: `GET /api/schedules`, `POST /api/schedules`, `PATCH /api/schedules/{id}`, `DELETE /api/schedules/{id}`
- **Message Queue**: `GET /api/messages/queue`, `POST /api/messages/queue`, `PATCH /api/messages/queue/{id}`, `DELETE /api/messages/queue/{id}`, `POST /api/messages/queue/{id}/retry`
- **Message History**: `GET /api/messages/history`, `DELETE /api/messages/history/{id}`
- **Dashboard**: `GET /api/dashboard/stats`
- **Stripe Webhook**: `POST /stripe/webhook`

See [BACKEND_TESTING_GUIDE.md](../BACKEND_TESTING_GUIDE.md) for examples of testing active endpoints.
