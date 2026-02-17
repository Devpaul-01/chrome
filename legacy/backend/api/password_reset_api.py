from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash
from backend.password_reset import request_password_reset, reset_password

password_reset_bp = Blueprint("password_reset_bp", __name__)

@password_reset_bp.route("/api/v1/forget-password", methods=["POST"])
def forgot_password():
    data = request.get_json()
    email = data.get("email")
    return jsonify(request_password_reset(email))

@password_reset_bp.route("/api/v1/reset-password", methods=["POST"])
def update_password():
    data = request.get_json()
    token = data.get("token")
    new_password = data.get("password")
    hashed_pw = generate_password_hash(new_password)
    return jsonify(reset_password(token, hashed_pw))