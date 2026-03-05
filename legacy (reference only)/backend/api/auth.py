from __future__ import annotations

from flask import Blueprint, jsonify, request
from sqlalchemy import select

from ..database import session_scope
from ..models import User


auth_bp = Blueprint("auth", __name__, url_prefix="/api/v1")


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    with session_scope() as session:
        existing = session.scalar(select(User).where(User.email == email))
        if existing is not None:
            return jsonify({"error": "User already exists"}), 409

        user = User(email=email, is_active=True)
        user.set_password(password)
        session.add(user)
        session.flush()

        return jsonify({"message": "User registered successfully", "id": user.id}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    with session_scope() as session:
        user = session.scalar(select(User).where(User.email == email))
        if user is None:
            return jsonify({"error": "User not found"}), 404

        if not user.is_active:
            return jsonify({"error": "User is inactive"}), 403

        if not user.check_password(password):
            return jsonify({"error": "Invalid credentials"}), 401

        token = user.refresh_token()
        session.flush()

        return jsonify({"message": "Login successful", "id": user.id, "email": user.email, "token": token}), 200


@auth_bp.post("/forget-password")
def forget_password():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    new_password = data.get("new_password")

    if not email or not new_password:
        return jsonify({"error": "Missing email or new password"}), 400

    with session_scope() as session:
        user = session.scalar(select(User).where(User.email == email))
        if user is None:
            return jsonify({"error": "User not found"}), 404

        user.set_password(new_password)
        session.flush()

        return jsonify({"message": "Password reset successful", "id": user.id}), 200