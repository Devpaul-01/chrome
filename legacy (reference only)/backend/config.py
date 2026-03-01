from dataclasses import dataclass
from os import getenv

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True, slots=True)
class Settings:
    db_url: str


def _build_db_url() -> str:
    url = getenv("DATABASE_URL")
    if url:
        return url

    user = getenv("DB_USER")
    if not user:
        raise ValueError("DB_USER is required")

    password = getenv("DB_PASS")
    if not password:
        raise ValueError("DB_PASS is required")

    host = getenv("DB_HOST", "localhost")
    port = getenv("DB_PORT", "5432")
    name = getenv("DB_NAME")
    if not name:
        raise ValueError("DB_NAME is required")

    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


def get_settings() -> Settings:
    return Settings(db_url=_build_db_url())


__all__ = ["Settings", "get_settings"]
