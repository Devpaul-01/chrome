from backend.database import session_scope
from backend.models import MessageGreeting, MessageMainPart, MessageClosing

TABLE_MAP = {
    "greeting": {
        "model": MessageGreeting,
        "column": "greeting_text"
    },
    "body": {
        "model": MessageMainPart,
        "column": "body_text"
    },
    "closing": {
        "model": MessageClosing,
        "column": "closing_text"
    }
}

def create_segment(user_id, title, segment_type, content):
    config = TABLE_MAP.get(segment_type)

    if not config:
        return {"success": False, "message": "Invalid segment type."}

    model_class = config["model"]
    column = config["column"]

    with session_scope() as session:
        item = model_class(user_id=user_id, title=title)
        setattr(item, column, content)
        session.add(item)

    return {"success": True, "message": "Segment created"}


def get_segments(user_id: int):
    result = {
        "greetings": [],
        "body": [],
        "closings": [],
    }

    with session_scope() as session:
        greetings = session.query(MessageGreeting).filter_by(user_id=user_id).all()
        body_parts = session.query(MessageMainPart).filter_by(user_id=user_id).all()
        closings = session.query(MessageClosing).filter_by(user_id=user_id).all()

        result["greetings"] = [
            {"id": g.id, "title": g.title, "content": g.greeting_text}
            for g in greetings
        ]

        result["body"] = [
            {"id": b.id, "title": b.title, "content": b.body_text}
            for b in body_parts
        ]

        result["closings"] = [
            {"id": c.id, "title": c.title, "content": c.closing_text}
            for c in closings
        ]

    return {"success": True, "segments": result}