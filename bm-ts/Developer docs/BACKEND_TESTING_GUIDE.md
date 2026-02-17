# Backend Testing Guide

> **Note:** The backend now runs entirely in Docker. No local Python setup required.

## Prerequisites

1. **Docker Desktop**
   - Ensure Docker Desktop is running
   - Verify: `docker --version`

2. **Environment Setup**
   ```bash
   cd bm-ts/backend
   
   # Create .env file from example
   cp .env.example .env
   
   # Edit .env and provide:
   # - DATABASE_URL (pre-configured for Docker)
   # - SECRET_KEY
   # - STRIPE_SECRET_KEY
   # - STRIPE_WEBHOOK_SECRET
   # - CORS_ORIGINS
   ```

3. **Start Services**
   ```bash
   docker-compose up -d
   ```
   
   The database schema (`ddl.sql`) and migrations are automatically applied on first run.

## Starting the Server

```bash
cd bm-ts/backend
docker-compose up -d
```

**Check status:**
```bash
docker-compose ps
```

**View logs:**
```bash
docker-compose logs backend --tail=50 --follow
```

Server will be available at:
- API: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

**Health check:**
```bash
curl http://localhost:8000/health
```

## Testing Endpoints

### 1. Register and Login

```bash
# Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Response: {"access_token":"...","refresh_token":"..."}
# Save the access_token for subsequent requests
```

### 2. Password Reset Flow

```bash
# Request password reset
curl -X POST http://localhost:8000/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Check console output for reset token (since email is not configured)
# Use the token to reset password

curl -X POST http://localhost:8000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_FROM_CONSOLE","new_password":"newpass123"}'
```

### 3. Change Password (Authenticated)

```bash
curl -X POST http://localhost:8000/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"current_password":"testpass123","new_password":"newpass456"}'
```

### 4. Birthday Schedules

```bash
# Create schedule
curl -X POST http://localhost:8000/api/schedules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"days_before":1,"enabled":true}'

# List schedules
curl -X GET http://localhost:8000/api/schedules \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Update schedule
curl -X PATCH http://localhost:8000/api/schedules/SCHEDULE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"enabled":false}'

# Delete schedule
curl -X DELETE http://localhost:8000/api/schedules/SCHEDULE_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Message Queue

```bash
# Create queued message
curl -X POST http://localhost:8000/api/messages/queue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "friend_name":"John Doe",
    "friend_profile_url":"https://facebook.com/johndoe",
    "birthday_date":"2025-02-15T00:00:00Z",
    "scheduled_send_time":"2025-02-14T10:00:00Z",
    "message_content":"Happy Birthday John!"
  }'

# List queued messages
curl -X GET http://localhost:8000/api/messages/queue \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Update queued message
curl -X PATCH http://localhost:8000/api/messages/queue/MESSAGE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"message_content":"Updated birthday message!"}'

# Retry failed message
curl -X POST http://localhost:8000/api/messages/queue/MESSAGE_ID/retry \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Cancel message
curl -X DELETE http://localhost:8000/api/messages/queue/MESSAGE_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 6. Message History

```bash
# List all history
curl -X GET http://localhost:8000/api/messages/history \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Search history
curl -X GET "http://localhost:8000/api/messages/history?search=John&status_filter=sent" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Delete history item
curl -X DELETE http://localhost:8000/api/messages/history/MESSAGE_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 7. Dashboard Stats

```bash
curl -X GET http://localhost:8000/api/dashboard/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Testing with Chrome Extension

1. **Update Extension Config**
   - Edit `bm-ts/extension/src/api/client.ts`
   - Ensure `API_BASE_URL` points to `http://localhost:8000`

2. **Rebuild Extension**
   ```bash
   cd bm-ts/extension
   npm run build
   ```

3. **Load Extension in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `bm-ts/extension/dist` folder

4. **Test Features**
   - Click extension icon to open popup
   - Test registration/login
   - Test password reset flow
   - Configure schedules in automation settings
   - View message queue and history
   - Check dashboard stats

## Common Issues

### 1. CORS Errors
- Add your extension ID to `CORS_ORIGINS` in `.env`
- Format: `chrome-extension://YOUR_EXTENSION_ID`

### 2. Database Connection
- Verify PostgreSQL is running: `psql -U postgres -l`
- Check DATABASE_URL in `.env`

### 3. Import Errors
- Ensure dependencies are installed: `pip install -e .`
- Verify Python version: `python --version` (should be 3.11+)

### 4. Migration Errors
- Check if tables already exist: `\dt` in psql
- Drop and recreate database if needed
- Rerun both migration scripts in order

### 5. Email Not Sending
- Password reset emails are logged to console (not sent)
- Implement actual email service in `app/services/password_reset.py`
- Add email provider credentials to `.env`

## Using Swagger UI

1. Open http://localhost:8000/docs in browser
2. Click "Authorize" button at top right
3. Enter: `Bearer YOUR_ACCESS_TOKEN`
4. Click "Authorize" then "Close"
5. Now you can test all authenticated endpoints interactively

## Monitoring Logs

Server logs will show:
- Request/response details
- SQL queries (if debug enabled)
- Password reset tokens (console only)
- Error stack traces

## Next Steps After Testing

1. **Configure Email Service**
   - Choose provider (SendGrid, AWS SES, Mailgun)
   - Add credentials to environment
   - Update `password_reset.py` service

2. **Add Rate Limiting**
   - Install: `pip install slowapi`
   - Limit password reset requests per IP/email

3. **Background Jobs**
   - Implement message sending worker
   - Move messages from queue to history after sending
   - Cleanup expired password reset tokens

4. **Production Deployment**
   - Use proper secret keys
   - Enable HTTPS
   - Configure production database
   - Set up proper CORS origins
   - Add monitoring/logging service
