"""
WebSocket router for real-time updates
"""

import asyncio
import json
import logging
from typing import Dict
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jwt import JWTError, decode_token, ensure_token_type, TokenType
from app.db.session import get_db
from app.db.models import User, UserSession
from sqlalchemy import select
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Manages WebSocket connections for users"""

    def __init__(self):
        # Maps user_id to list of WebSocket connections
        self.active_connections: Dict[UUID, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: UUID):
        """Add a WebSocket connection for a user"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(
            f"WebSocket connected for user {user_id}. Total connections: {len(self.active_connections[user_id])}"
        )

    def disconnect(self, websocket: WebSocket, user_id: UUID):
        """Remove a WebSocket connection for a user"""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WebSocket disconnected for user {user_id}")

    async def send_personal_message(self, message: dict, user_id: UUID):
        """Send a message to all connections for a specific user"""
        if user_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {e}")
                    disconnected.append(connection)

            # Clean up disconnected websockets
            for connection in disconnected:
                self.disconnect(connection, user_id)

    async def broadcast_to_user(self, event_type: str, data: dict, user_id: UUID):
        """Broadcast an event to a specific user"""
        message = {
            "type": event_type,
            "data": data,
            "timestamp": str(data.get("timestamp", "")),
        }
        await self.send_personal_message(message, user_id)


# Global connection manager instance
manager = ConnectionManager()


async def get_current_user_from_token(token: str, db: AsyncSession) -> User:
    """Validate JWT token (must be access type) and return user."""
    credentials_exception = Exception("Could not validate credentials")
    try:
        payload = decode_token(token)
        ensure_token_type(payload, TokenType.ACCESS)
        user_id: str = payload.get("sub")  # type: ignore[assignment]
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Verify session is still valid
    session_id = payload.get("sid")
    if session_id:
        result = await db.execute(
            select(UserSession).where(
                UserSession.id == UUID(session_id),
                UserSession.user_id == UUID(user_id),
            )
        )
        session = result.scalar_one_or_none()
        if session is None or session.revoked_at is not None:
            raise credentials_exception
        if session.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(
            timezone.utc
        ):
            raise credentials_exception

    user_result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    """
    WebSocket endpoint for real-time updates.

    Authentication is provided by sending a first message after connection:
    ``{"type": "auth", "token": "<jwt>"}``

    If no valid token is received within 10 seconds the connection is closed.

    Message types sent to client:
    - message_queue_update: Message queue status changed
    - message_history_update: New message sent
    - dashboard_update: Dashboard stats changed
    - notification: General notification
    """
    user: User | None = None

    try:
        # Accept the raw WebSocket so the client can send us the auth message
        await websocket.accept()

        # Wait up to 10 s for an auth message
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            msg = json.loads(raw)
            if msg.get("type") == "auth" and msg.get("token"):
                user = await get_current_user_from_token(msg["token"], db)
        except (asyncio.TimeoutError, Exception):
            pass

        if user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Register the connection
        if user.id not in manager.active_connections:
            manager.active_connections[user.id] = []
        manager.active_connections[user.id].append(websocket)
        logger.info(
            f"WebSocket connected for user {user.id}. Total connections: {len(manager.active_connections[user.id])}"
        )

        # Send welcome message
        await websocket.send_json(
            {
                "type": "connected",
                "data": {"message": "WebSocket connected successfully"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

        # Keep connection alive and handle incoming messages
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)

                # Handle ping
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                # Ignore late auth messages gracefully
                elif message.get("type") == "auth":
                    pass

        except WebSocketDisconnect:
            manager.disconnect(websocket, user.id)
            logger.info(f"WebSocket disconnected normally for user {user.id}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if user is not None:
            manager.disconnect(websocket, user.id)
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass


# Helper functions to broadcast events (called from other routers)
async def broadcast_message_queue_update(user_id: UUID, message_data: dict):
    """Broadcast message queue update to user"""
    await manager.broadcast_to_user("message_queue_update", message_data, user_id)


async def broadcast_message_history_update(user_id: UUID, message_data: dict):
    """Broadcast new message history item to user"""
    await manager.broadcast_to_user("message_history_update", message_data, user_id)


async def broadcast_dashboard_update(user_id: UUID, stats_data: dict):
    """Broadcast dashboard stats update to user"""
    await manager.broadcast_to_user("dashboard_update", stats_data, user_id)


async def broadcast_notification(user_id: UUID, notification_data: dict):
    """Send a notification to user"""
    await manager.broadcast_to_user("notification", notification_data, user_id)
