from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


_engine: Engine | None = None
_Session: sessionmaker[Session] | None = None


def init_engine(url: str) -> None:
    global _engine, _Session
    if _engine is not None:
        return

    engine = create_engine(url, future=True)
    _engine = engine
    _Session = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine, future=True)


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("Database engine has not been initialised")
    return _engine


@contextmanager
def session_scope() -> Iterator[Session]:
    if _Session is None:
        raise RuntimeError("Session factory has not been initialised")

    session = _Session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


__all__ = ["get_engine", "init_engine", "session_scope"]