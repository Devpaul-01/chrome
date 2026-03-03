from __future__ import annotations

from secrets import token_hex

from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from werkzeug.security import check_password_hash, generate_password_hash

from .base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    current_bw_token = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    def set_password(self, value: str) -> None:
        self.password_hash = generate_password_hash(value)

    def check_password(self, value: str) -> bool:
        return check_password_hash(self.password_hash, value)

    def refresh_token(self) -> str:
        token = token_hex(32)
        self.current_bw_token = token
        return token

    def __repr__(self) -> str:  # pragma: no cover
        return f"User(id={self.id!r}, email={self.email!r})"


__all__ = ["User"]