# Real-Time Features Documentation

**Last Updated:** March 1, 2026

## Overview

The BirthdayMessaging extension now includes WebSocket-based real-time updates to provide instant feedback across all components without requiring manual refresh.

## Architecture

### Backend (FastAPI)

- **WebSocket Endpoint**: `/ws`
- **Authentication**: JWT token passed via query parameter
- **Connection Manager**: Manages multiple connections per user
- **Event Broadcasting**: Sends real-time updates when data changes

### Frontend (React + TypeScript)

- **WebSocket Client**: Singleton instance (`wsClient`) in `src/api/websocket.ts`
- **Auto-reconnect**: Automatic reconnection with exponential backoff (max 5 attempts)
- **Keep-alive**: Ping/pong mechanism every 30 seconds
- **Event Subscription**: Components subscribe to specific event types

## Event Types

### 1. `message_queue_update`

Fired when message queue changes:

- **Action: `created`** - New message added to queue
- **Action: `updated`** - Message content or status changed
- **Action: `deleted`** - Message cancelled/removed from queue

**Payload Example:**

```json
{
  "type": "message_queue_update",
  "data": {
    "action": "created",
    "message": {
      "id": "uuid",
      "friend_name": "John Doe",
      "status": "pending",
      "scheduled_send_time": "2026-02-11T12:00:00"
    },
    "timestamp": "2026-02-10T15:30:00"
  }
}
```

### 2. `message_history_update`

Fired when message history changes:

- **Action: `created`** - New message sent (added to history)
- **Action: `deleted`** - History item removed

**Payload Example:**

```json
{
  "type": "message_history_update",
  "data": {
    "action": "created",
    "message": {
      "id": "uuid",
      "friend_name": "Jane Smith",
      "status": "sent",
      "sent_at": "2026-02-10T15:30:00"
    },
    "timestamp": "2026-02-10T15:30:00"
  }
}
```

### 3. `dashboard_update`

Fired when dashboard statistics change:

**Payload Example:**

```json
{
  "type": "dashboard_update",
  "data": {
    "total_messages_sent": 150,
    "messages_sent_today": 5,
    "messages_sent_this_week": 23,
    "messages_sent_this_month": 89,
    "success_rate": 98.5,
    "friends_with_upcoming_birthdays": 12,
    "queued_messages": 8,
    "automation_enabled": true
  }
}
```

### 4. `notification`

General notification for user feedback:

**Payload Example:**

```json
{
  "type": "notification",
  "data": {
    "message": "Birthday scan completed successfully",
    "level": "success"
  }
}
```

### 5. `connected`

Sent immediately after WebSocket connection established:

**Payload Example:**

```json
{
  "type": "connected",
  "data": {
    "message": "WebSocket connected successfully"
  }
}
```

## Implementation Details

### Connection Flow

1. **User Login** → App.tsx calls `config.getWSConfig` → Gets WebSocket URL and JWT token
2. **Initialize Connection** → `wsClient.connect(config)` establishes WebSocket
3. **Authentication** → Backend validates JWT token
4. **Connection Confirmed** → Backend sends `connected` event
5. **Keep-Alive** → Client sends ping every 30 seconds

### Disconnection Flow

1. **User Logout** → App.tsx calls `wsClient.disconnect()`
2. **Cleanup** → WebSocket closed, timers cleared, event listeners removed

### Reconnection Logic

If connection drops unexpectedly:

- **Attempt 1**: Reconnect after 3 seconds
- **Attempt 2**: Reconnect after 6 seconds
- **Attempt 3**: Reconnect after 9 seconds
- **Attempt 4**: Reconnect after 12 seconds
- **Attempt 5**: Reconnect after 15 seconds
- **After max attempts**: Give up and log error

## Component Integration

### MessageQueue Component

```typescript
import wsClient from "../../api/websocket";

useEffect(() => {
  // Subscribe to real-time updates
  const unsubscribe = wsClient.on("message_queue_update", (data) => {
    if (data.action === "created") {
      loadQueue(); // Reload entire queue
    } else if (data.action === "updated") {
      // Update specific message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.message.id ? { ...m, ...data.message } : m,
        ),
      );
    } else if (data.action === "deleted") {
      // Remove message
      setMessages((prev) => prev.filter((m) => m.id !== data.message.id));
    }
  });

  return () => unsubscribe(); // Cleanup on unmount
}, []);
```

### MessageHistory Component

```typescript
useEffect(() => {
  const unsubscribe = wsClient.on("message_history_update", (data) => {
    if (data.action === "deleted") {
      setMessages((prev) => prev.filter((m) => m.id !== data.message.id));
    } else if (data.action === "created") {
      loadHistory(); // Reload to get new message
    }
  });

  return () => unsubscribe();
}, []);
```

### Dashboard Component

```typescript
useEffect(() => {
  const unsubDashboard = wsClient.on("dashboard_update", (data) => {
    setStats(data); // Update stats directly
  });

  const unsubQueue = wsClient.on("message_queue_update", () => {
    loadStats(); // Refresh when queue changes
  });

  const unsubHistory = wsClient.on("message_history_update", () => {
    loadStats(); // Refresh when history changes
  });

  return () => {
    unsubDashboard();
    unsubQueue();
    unsubHistory();
  };
}, []);
```

## Backend Broadcasting

To broadcast events from backend routers:

```python
from app.api.routers.websocket import broadcast_message_queue_update

# After creating/updating a message
await broadcast_message_queue_update(user.id, {
    "action": "created",
    "message": {
        "id": str(message.id),
        "friend_name": message.friend_name,
        "status": message.status,
        "scheduled_send_time": message.scheduled_send_time.isoformat(),
    },
    "timestamp": datetime.utcnow().isoformat(),
})
```

## Testing Real-Time Features

### Local Testing

1. **Start Backend**:

   ```bash
   cd bm-ts/backend
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Build Extension**:

   ```bash
   cd bm-ts/extension
   npm run build
   ```

3. **Load Extension** in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `bm-ts/extension/dist` folder

4. **Test Scenarios**:
   - **Test 1**: Open two popup windows, create a message in one → should appear in other
   - **Test 2**: Cancel a message in one window → should disappear from other
   - **Test 3**: Open Dashboard + MessageQueue → create message → dashboard stats update
   - **Test 4**: Close/reopen popup → WebSocket reconnects automatically

### Production Testing

1. WebSocket URL: Replace `http://localhost:8000` with production URL
2. Ensure WebSocket endpoint is accessible (wss:// for HTTPS)
3. Check firewall allows WebSocket connections
4. Monitor connection logs in browser DevTools console

## Performance Considerations

### Bandwidth

- **Ping/Pong**: 100 bytes every 30 seconds ≈ 200 KB/day
- **Event Messages**: Typically 200-500 bytes per event
- **Estimated Usage**: < 1 MB per day for active user

### Memory

- WebSocket client: ~50 KB
- Event listeners: Minimal (cleanup on unmount)

### Battery Impact

- Minimal: WebSocket maintains single persistent connection
- More efficient than polling every few seconds

## Troubleshooting

### WebSocket Not Connecting

1. Check backend is running
2. Verify JWT token is valid (check browser console)
3. Check CORS settings allow WebSocket connections
4. Inspect Network tab for WebSocket connection status

### Events Not Received

1. Check component is mounted and subscribed
2. Verify user_id matches in backend broadcast
3. Check browser console for WebSocket messages
4. Ensure backend is calling broadcast functions

### Connection Drops Frequently

1. Check network stability
2. Increase ping interval if needed
3. Check backend logs for errors
4. Verify WebSocket middleware/proxy settings

## Future Enhancements

### Potential Features

- **Typing Indicators**: Show when another instance is editing
- **Presence**: Show online/offline status
- **Conflict Resolution**: Handle concurrent edits
- **Message Queuing**: Queue events if offline, replay on reconnect
- **Compression**: Add message compression for large payloads
- **Binary Messages**: Use binary for performance-critical data

### Scalability

- **Redis PubSub**: Use Redis for multi-server broadcasting
- **Load Balancing**: Sticky sessions for WebSocket connections
- **Horizontal Scaling**: Shared connection manager across instances

## Security

### Current Implementation

- ✅ JWT authentication on connection
- ✅ User-specific broadcasting (no data leakage)
- ✅ HTTPS/WSS in production
- ✅ Token validation on each message

### Recommendations

- [ ] Rate limiting on WebSocket messages
- [ ] Connection limits per user
- [ ] Message size limits
- [ ] Anomaly detection for suspicious activity

## Files Modified

### Backend

- `app/api/routers/websocket.py` - New WebSocket router
- `app/api/routers/messages.py` - Added broadcasts
- `app/main.py` - Registered WebSocket router

### Frontend

- `src/api/websocket.ts` - New WebSocket client
- `src/utils/messages.ts` - Added `config.getWSConfig` message type
- `src/background/index.ts` - Added WebSocket config handler
- `src/popup/App.tsx` - WebSocket initialization and cleanup
- `src/popup/components/MessageQueue.tsx` - Real-time queue updates
- `src/popup/components/MessageHistory.tsx` - Real-time history updates
- `src/popup/components/Dashboard.tsx` - Real-time stats updates

---

**Last Updated**: February 10, 2026  
**Status**: ✅ Production Ready
