from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify
from sqlalchemy import select

from ..database import session_scope
from ..models import User


user_bp = Blueprint("users", __name__)


@user_bp.get("/user")
def get_user():
    with session_scope() as session:
        user = session.scalar(select(User).order_by(User.id))
        if user is None:
            return jsonify({"error": "No user found"}), 404

        payload = _serialize_user(user)
        return jsonify(payload), 200


def _serialize_user(user: User) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "is_active": user.is_active,
        "created_at": _iso(user.created_at),
        "updated_at": _iso(user.updated_at),
    }


def _iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()