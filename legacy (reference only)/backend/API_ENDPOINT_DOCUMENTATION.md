# Birthday Messaging API Documentation

**Version:** 1.0.0  
**Base URL (Production):** `https://db.birthdaymessaging.io`  
**Base URL (Local):** `http://localhost:5000`  
**Last Updated:** January 17, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Endpoints](#endpoints)
   - [Authentication](#authentication-endpoints)
   - [User Management](#user-management-endpoints)
   - [Message Segments](#message-segments-endpoints)
   - [Password Reset](#password-reset-endpoints)
5. [Data Models](#data-models)
6. [Frontend Usage Patterns](#frontend-usage-patterns)
7. [Common Issues](#common-issues)

---

## Overview

The Birthday Messaging API is a RESTful API that powers the Birthday Messaging Chrome extension. It provides user authentication, message template management, and password recovery functionality.

### Key Features
- User registration and login with token-based authentication
- Message template management (greetings, body, closings)
- Password reset functionality
- Cross-Origin Resource Sharing (CORS) enabled for Facebook domains

### Technical Stack
- **Framework:** Flask 2.x
- **Database:** PostgreSQL
- **ORM:** SQLAlchemy
- **Authentication:** Token-based (64-character hex tokens)
- **Deployment:** Docker + Traefik reverse proxy

---

## Authentication

### Token-Based Authentication

Most endpoints require authentication via a bearer token obtained during login.

**How to Authenticate:**
1. Register a new user via `/api/v1/register`
2. Login via `/api/v1/login` to receive a token
3. Include token in subsequent requests (typically stored by Chrome extension)

**Token Format:**
- 64-character hexadecimal string
- Generated using Python's `secrets.token_hex(32)`
- Stored in `User.current_bw_token` database field

**Note:** Current implementation does NOT require Authorization headers. Frontend stores token in Chrome storage and includes it in request bodies where needed.

---

## Error Handling

All error responses follow this structure:

```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET/POST operations |
| 201 | Created | Successful resource creation (e.g., user registration) |
| 400 | Bad Request | Missing required fields or invalid input |
| 401 | Unauthorized | Invalid credentials (wrong password) |
| 403 | Forbidden | User account is inactive |
| 404 | Not Found | Resource doesn't exist (e.g., user not found) |
| 409 | Conflict | Resource already exists (e.g., duplicate email) |
| 500 | Internal Server Error | Server-side error (rare) |

---

## Endpoints

### Authentication Endpoints

All authentication endpoints are in the `/api/v1` namespace.

---

#### 1. Register User

Create a new user account.

**Endpoint:** `POST /api/v1/register`

**Request Headers:**
```http
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (Success - 201):**
```json
{
  "message": "User registered successfully",
  "id": 42
}
```

**Response (Error - 400):**
```json
{
  "error": "Missing email or password"
}
```

**Response (Error - 409):**
```json
{
  "error": "User already exists"
}
```

**Implementation Details:**
- Password is hashed using Werkzeug's `generate_password_hash()`
- User is automatically set to `is_active=true`
- Email must be unique (database constraint)

**Frontend Usage:**
- Called from `register.html` via minified `register.js`
- Redirects to login page on success

**Test with cURL:**
```bash
curl -X POST https://db.birthdaymessaging.io/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"myPassword123"}'
```

---

#### 2. Login

Authenticate a user and receive an authentication token.

**Endpoint:** `POST /api/v1/login`

**Request Headers:**
```http
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (Success - 200):**
```json
{
  "message": "Login successful",
  "id": 42,
  "email": "user@example.com",
  "token": "a1b2c3d4e5f6...7890" 
}
```

**Response (Error - 400):**
```json
{
  "error": "Missing email or password"
}
```

**Response (Error - 404):**
```json
{
  "error": "User not found"
}
```

**Response (Error - 403):**
```json
{
  "error": "User is inactive"
}
```

**Response (Error - 401):**
```json
{
  "error": "Invalid credentials"
}
```

**Implementation Details:**
- Password verification uses `check_password_hash()`
- New token generated on every login via `User.refresh_token()`
- Token is 64 characters (hex from `token_hex(32)`)
- Old token is invalidated when new token is generated

**Frontend Usage:**
- Called from `login.html` via minified `login.js`
- Token stored in Chrome storage (both local and sync)
- User ID and email stored in storage
- Redirects to `dashboard.html` on success

**Test with cURL:**
```bash
curl -X POST https://db.birthdaymessaging.io/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"myPassword123"}'
```

---

#### 3. Forgot Password (Insecure Version)

Reset user password without verification. **⚠️ SECURITY WARNING: This endpoint allows password reset without email verification or token validation.**

**Endpoint:** `POST /api/v1/forget-password`

**Request Headers:**
```http
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "new_password": "newSecurePassword456"
}
```

**Response (Success - 200):**
```json
{
  "message": "Password reset successful",
  "id": 42
}
```

**Response (Error - 400):**
```json
{
  "error": "Missing email or new password"
}
```

**Response (Error - 404):**
```json
{
  "error": "User not found"
}
```

**Implementation Details:**
- Located in `backend/api/auth.py`
- **NO email verification**
- **NO token validation**
- Directly sets new password hash
- Anyone who knows a user's email can reset their password

**Security Issue:**
This endpoint is highly insecure. A secure version exists in `backend/api/password_reset_api.py` but references non-existent database fields (`password_reset_token`, `password_reset_expires_at`).

**Frontend Usage:**
- Called from `forgot-password.html` via minified `forgotpassword.js`
- Users enter email + new password
- No email confirmation flow

**Test with cURL:**
```bash
curl -X POST https://db.birthdaymessaging.io/api/v1/forget-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","new_password":"newPassword789"}'
```

**Recommended Action:**
- Add `password_reset_token` and `password_reset_expires_at` fields to User model
- Disable this insecure endpoint
- Implement email verification flow
- Use secure endpoint from `password_reset_api.py`

---

### User Management Endpoints

#### 4. Get User

Retrieve the first user from the database (primarily for debugging).

**Endpoint:** `GET /user`

**Request Headers:**
```http
(None required)
```

**Response (Success - 200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "is_active": true,
  "created_at": "2026-01-15T10:30:00",
  "updated_at": "2026-01-17T14:25:00"
}
```

**Response (Error - 404):**
```json
{
  "error": "No user found"
}
```

**Implementation Details:**
- Located in `backend/api/users.py`
- Returns first user ordered by ID
- Does NOT require authentication
- Primarily used for debugging/testing
- Should probably be protected or removed in production

**Frontend Usage:**
- Not currently used by extension frontend

**Test with cURL:**
```bash
curl -X GET https://db.birthdaymessaging.io/user
```

---

### Message Segments Endpoints

Message segments are templates for birthday messages consisting of three types:
- **Greetings:** Opening phrases (e.g., "Happy Birthday!")
- **Body:** Main message content
- **Closings:** Ending phrases (e.g., "Best wishes")

---

#### 5. Create Message Segment

Create a new message template segment.

**Endpoint:** `POST /api/v1/segments`

**Request Headers:**
```http
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_id": 42,
  "title": "Casual Birthday Greeting",
  "segment_type": "greeting",
  "content": "Happy Birthday! 🎉"
}
```

**Valid `segment_type` Values:**
- `"greeting"` - Stored in `message_greetings` table
- `"body"` - Stored in `message_main_parts` table
- `"closing"` - Stored in `message_closings` table

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Segment created"
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Missing required fields."
}
```

**Response (Error - Invalid Type):**
```json
{
  "success": false,
  "message": "Invalid segment type."
}
```

**Implementation Details:**
- Located in `backend/api/message_segments_api.py`
- Uses `backend/message_segments.py` for business logic
- Maps segment types to database tables:
  - `greeting` → `MessageGreeting.greeting_text`
  - `body` → `MessageMainPart.body_text`
  - `closing` → `MessageClosing.closing_text`

**Database Tables:**
- `message_greetings` (id, user_id, title, greeting_text)
- `message_main_parts` (id, user_id, title, body_text)
- `message_closings` (id, user_id, title, closing_text)

**Frontend Usage:**
- Called from `settings.html` or message management pages
- Users create multiple templates to randomize messages

**Test with cURL:**
```bash
curl -X POST https://db.birthdaymessaging.io/api/v1/segments \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 42,
    "title": "Formal Greeting",
    "segment_type": "greeting",
    "content": "Dear friend, happy birthday!"
  }'
```

---

#### 6. List Message Segments

Retrieve all message segments for a specific user.

**Endpoint:** `GET /api/v1/segments/<user_id>`

**Request Headers:**
```http
(None required)
```

**URL Parameters:**
- `user_id` (integer) - User's unique identifier

**Response (Success - 200):**
```json
{
  "success": true,
  "segments": {
    "greetings": [
      {
        "id": 1,
        "title": "Casual",
        "content": "Happy Birthday! 🎉"
      },
      {
        "id": 2,
        "title": "Formal",
        "content": "Wishing you a wonderful birthday!"
      }
    ],
    "body": [
      {
        "id": 5,
        "title": "Short and sweet",
        "content": "Hope your day is amazing!"
      }
    ],
    "closings": [
      {
        "id": 10,
        "title": "Warm regards",
        "content": "Best wishes, [Your Name]"
      }
    ]
  }
}
```

**Implementation Details:**
- Returns all segments grouped by type
- Empty arrays returned for types with no segments
- Does NOT require authentication (security consideration)

**Frontend Usage:**
- Called on dashboard load
- Used to populate message template selectors
- Extension combines random greeting + body + closing

**Test with cURL:**
```bash
curl -X GET https://db.birthdaymessaging.io/api/v1/segments/42
```

---

### Password Reset Endpoints

#### 7. Request Password Reset (Secure Version - BROKEN)

**⚠️ WARNING: This endpoint exists but is NOT functional. References non-existent database fields.**

**Endpoint:** `POST /api/v1/forget-password` (via `password_reset_bp`)

**Note:** There are TWO endpoints with the same path:
1. **Insecure version** in `backend/api/auth.py` (works, but insecure)
2. **Secure version** in `backend/api/password_reset_api.py` (broken)

The secure version calls `request_password_reset()` from `backend/password_reset.py`, which tries to set:
- `user.password_reset_token` ❌ Field doesn't exist
- `user.password_reset_expires_at` ❌ Field doesn't exist

**To Fix:**
1. Add fields to `backend/models/user.py`:
```python
password_reset_token = Column(String(64), nullable=True)
password_reset_expires_at = Column(DateTime, nullable=True)
```
2. Create database migration
3. Test endpoint
4. Remove insecure version from `auth.py`

---

#### 8. Reset Password (Secure Version - BROKEN)

**⚠️ WARNING: This endpoint exists but is NOT functional.**

**Endpoint:** `POST /api/v1/reset-password`

**Intended Request Body:**
```json
{
  "token": "password_reset_token_here",
  "password": "newSecurePassword"
}
```

**Implementation Issues:**
- References non-existent database fields
- Would validate token expiration
- Would hash password before storage

**Frontend Usage:**
- Would be called from `updatepassword.html`
- Not currently functional

---

## Data Models

### User Model

**Table:** `users`

```python
{
  "id": Integer (Primary Key),
  "email": String (Unique, Indexed),
  "password_hash": String (Werkzeug hashed),
  "current_bw_token": String (64 chars, nullable),
  "is_active": Boolean (default: true),
  "created_at": DateTime (auto-generated),
  "updated_at": DateTime (auto-updated)
}
```

**Missing Fields (for secure password reset):**
- `password_reset_token`: String(64), nullable
- `password_reset_expires_at`: DateTime, nullable

---

### Message Segment Models

#### MessageGreeting

**Table:** `message_greetings`

```python
{
  "id": Integer (Primary Key),
  "user_id": Integer (Foreign Key → users.id),
  "title": String,
  "greeting_text": Text
}
```

#### MessageMainPart

**Table:** `message_main_parts`

```python
{
  "id": Integer (Primary Key),
  "user_id": Integer (Foreign Key → users.id),
  "title": String,
  "body_text": Text
}
```

#### MessageClosing

**Table:** `message_closings`

```python
{
  "id": Integer (Primary Key),
  "user_id": Integer (Foreign Key → users.id),
  "title": String,
  "closing_text": Text
}
```

---

## Frontend Usage Patterns

### Chrome Extension Integration

The Birthday Messaging Chrome extension interacts with the API in the following ways:

1. **On Extension Install/Load:**
   - Checks Chrome storage for existing token
   - If no token, redirects to `login.html`

2. **Login Flow:**
   - User enters credentials in `login.html`
   - Calls `POST /api/v1/login`
   - Stores token, user_id, email in Chrome storage
   - Redirects to `dashboard.html`

3. **Dashboard:**
   - Calls `GET /api/v1/segments/<user_id>`
   - Displays available message templates
   - User can create/edit/delete segments

4. **Facebook Integration:**
   - Content script (`contentScriptBundle.js`) runs on Facebook pages
   - Detects birthday notifications
   - Retrieves segments from API
   - Combines random greeting + body + closing
   - Posts to friend's timeline via Facebook's API

5. **Password Reset:**
   - User clicks "Forgot Password" on login page
   - Enters email + new password in `forgot-password.html`
   - Calls `POST /api/v1/forget-password`
   - Redirects to login

### API Call Patterns

**All minified JavaScript files include console.log statements:**
```javascript
console.log("head :: ", JSON.stringify(headers, null, 4))
console.log("e", error)
console.log("error", error)
```

These logs can help debug API interactions in Chrome DevTools.

**Headers sent by frontend:**
```javascript
{
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
}
```

---

## Common Issues

### Issue 1: CORS Errors

**Symptom:** `Access-Control-Allow-Origin` errors in Chrome console

**Cause:** Backend currently allows all origins (`*`), but this may cause issues with credentials.

**Current Configuration:**
```python
CORS(app, resources={r"/*": {"origins": "*"}})
```

**Recommended Fix:**
```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://www.facebook.com", "https://facebook.com"],
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
```

---

### Issue 2: Password Reset Not Working

**Symptom:** Secure password reset endpoint returns 500 error

**Cause:** Database fields `password_reset_token` and `password_reset_expires_at` don't exist in User model.

**Fix:** Add fields to `backend/models/user.py` and create migration

**Workaround:** Use insecure endpoint at `POST /api/v1/forget-password` (from auth.py)

---

### Issue 3: Token Expiration

**Symptom:** User must re-login frequently

**Cause:** Tokens are regenerated on every login, and there's no expiration logic.

**Implications:**
- Tokens never expire (security issue)
- Old tokens are immediately invalidated on new login
- No token refresh mechanism

**Recommended Enhancement:**
- Add `token_expires_at` field to User model
- Implement token refresh endpoint
- Add middleware to validate token expiration

---

### Issue 4: No Rate Limiting

**Symptom:** API vulnerable to brute force attacks

**Cause:** No rate limiting implemented

**Risk:**
- Brute force password attempts
- API abuse
- DDoS vulnerability

**Recommended Fix:**
- Install `flask-limiter`
- Add rate limits:
  - Login: 5 attempts per minute per IP
  - Register: 3 attempts per hour per IP
  - Password reset: 3 attempts per hour per email

---

### Issue 5: Minified Frontend Code

**Symptom:** Cannot debug or modify frontend functionality

**Cause:** All JavaScript files are production-minified bundles without source maps.

**Files Affected:**
- `js/login.js`
- `js/register.js`
- `js/contentScriptBundle.js`
- `js/serviceWorker.js`
- All other `js/*.js` files

**Impact:**
- Cannot refactor frontend
- Cannot add features
- Difficult to debug API integration issues

**Solutions:**
1. Contact previous developers for source code
2. Reverse engineer minified code (3-4 weeks)
3. Rewrite frontend from scratch (2-3 months)

---

## Testing Endpoints

### Using cURL

**Test Login:**
```bash
curl -X POST https://db.birthdaymessaging.io/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  -v
```

**Test Get Segments:**
```bash
curl -X GET https://db.birthdaymessaging.io/api/v1/segments/1 \
  -H "Content-Type: application/json" \
  -v
```

### Using Postman

1. Import endpoints using the examples in this document
2. Set base URL to `https://db.birthdaymessaging.io`
3. For POST requests, use Body → raw → JSON
4. Save token from login response for use in other requests

### Using Chrome DevTools

1. Load extension in Chrome
2. Open Chrome DevTools (F12)
3. Go to Network tab
4. Filter by "api"
5. Trigger action in extension (login, create segment, etc.)
6. Inspect request/response

---

## API Evolution & Versioning

### Current Version: 1.0.0

All endpoints use `/api/v1/` prefix.

### Planned Changes (Week 1-2):

1. **Add API version header:**
   ```
   X-API-Version: 1.0.0
   ```

2. **Standardize error responses:**
   ```json
   {
     "error": "Human message",
     "code": "MACHINE_CODE",
     "timestamp": "ISO8601",
     "details": {}
   }
   ```

3. **Add health check endpoint:**
   ```
   GET /api/v1/health
   ```

4. **Fix password reset:**
   - Add database fields
   - Enable secure endpoint
   - Deprecate insecure endpoint

---

## Security Recommendations

### High Priority

1. ⚠️ **Restrict CORS origins** - Currently allows all origins
2. ✅ **Implement rate limiting** - Prevent brute force attacks
3. ✅ **Fix password reset** - Current implementation is insecure
4. ⚠️ **Add token expiration** - Tokens currently never expire
5. ⚠️ **Require authentication on all user-specific endpoints** - Some endpoints don't verify ownership

### Medium Priority

1. Add request logging with timestamps
2. Implement token refresh mechanism
3. Add email verification on registration
4. Validate email format server-side
5. Add password strength requirements

### Low Priority

1. Add pagination to list segments endpoint
2. Add filtering/sorting to segments
3. Implement bulk operations for segments
4. Add user profile update endpoint
5. Add user deletion endpoint

---

## Changelog

### 1.0.0 (Current)
- Initial API implementation
- User registration and login
- Message segments CRUD
- Insecure password reset

### Planned 1.1.0 (Week 2)
- Health check endpoint
- API version headers
- Request logging middleware
- Password reset database fields (backend ready, frontend not integrated)

---

## Support & Debugging

### Backend Logs

**Location:** Docker container logs

**View logs:**
```bash
docker logs birthday-messaging-backend
```

**Common log patterns:**
- `POST /api/v1/login` - Login attempts
- `POST /api/v1/register` - Registration attempts
- `GET /api/v1/segments/<id>` - Segment retrieval

### Frontend Debugging

**Chrome Extension Console:**
1. Visit `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Inspect views: background page" or "service worker"
4. Check console for API errors

**Minified Code Console Logs:**
The minified JavaScript includes debug logs:
- `console.log("head :: ", ...)` - Request headers
- `console.log("e", error)` - Error responses
- `console.log("error", error)` - Fetch errors

### Database Access

**Connect to PostgreSQL:**
```bash
docker exec -it birthday-messaging-db psql -U postgres
```

**Common queries:**
```sql
-- List all users
SELECT id, email, is_active, created_at FROM users;

-- Count message segments by type
SELECT COUNT(*) FROM message_greetings;
SELECT COUNT(*) FROM message_main_parts;
SELECT COUNT(*) FROM message_closings;

-- Find user by email
SELECT * FROM users WHERE email = 'test@example.com';
```

---

## Appendix: File Locations

### Backend Files

- **Main app:** `backend/app.py`
- **App factory:** `backend/__init__.py`
- **Configuration:** `backend/config.py`
- **Database:** `backend/database.py`

**API Routes:**
- `backend/api/__init__.py` - Route registration
- `backend/api/auth.py` - Authentication endpoints
- `backend/api/users.py` - User management
- `backend/api/message_segments_api.py` - Segment endpoints
- `backend/api/password_reset_api.py` - Password reset (broken)

**Models:**
- `backend/models/user.py` - User model
- `backend/models/message_greeting.py`
- `backend/models/message_main_part.py`
- `backend/models/message_closing.py`

**Business Logic:**
- `backend/message_segments.py` - Segment operations
- `backend/password_reset.py` - Password reset logic (broken)

### Frontend Files (Minified)

- **Extension manifest:** `frontend/manifest.json`
- **HTML pages:** `frontend/*.html`
- **JavaScript (minified):** `frontend/js/*.js`
- **Styles:** `frontend/css/*.css`, `frontend/assets/*.css`

---

**Document Version:** 1.0  
**Author:** Development Team  
**Last Review:** January 17, 2026  
