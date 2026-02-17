from __future__ import annotations

from sqlalchemy import Column, Integer, String, Text, DateTime, func

from .base import Base


class MessageGreeting(Base):
    __tablename__ = "message_greetings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)

    greeting_text = Column(Text, nullable=False)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"MessageGreeting(id={self.id!r}, user_id={self.user_id!r}, title={self.title!r})"


__all__ = ["MessageGreeting"]
