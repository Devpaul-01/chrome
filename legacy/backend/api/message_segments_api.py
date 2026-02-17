from flask import Blueprint, request, jsonify
from backend.message_segments import create_segment, get_segments

message_segments_bp = Blueprint("message_segments_bp", __name__)

@message_segments_bp.route("/api/v1/segments", methods=["POST"])
def add_segment():
    data = request.get_json()
    user_id = data.get("user_id")
    title = data.get("title")
    segment_type = data.get("segment_type")
    content = data.get("content")

    if not all([user_id, title, segment_type, content]):
        return jsonify({"success": False, "message": "Missing required fields."}), 400

    result = create_segment(user_id, title, segment_type, content)
    return jsonify(result)

@message_segments_bp.route("/api/v1/segments/<int:user_id>", methods=["GET"])
def list_segments(user_id):
    result = get_segments(user_id)
    return jsonify(result)