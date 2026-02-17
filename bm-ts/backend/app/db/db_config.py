# contains methods for configuration of database connection
import re

from dataclasses import dataclass

from os import getenv
from dotenv import load_dotenv, find_dotenv



# Explicitly locate and load a .env file (searches upward from this file)
load_dotenv(find_dotenv())


@dataclass(frozen=True, slots=True)
class Settings:
    db_url: str

# constructs database url from environment variables
def _build_db_url() -> str:
    url = getenv("DATABASE_URL") # if DATABASE_URL detected, use it directly

    # or else, build from components
    if url:
        return url

    user = getenv("DB_USER")
    if not user:
        raise ValueError("DB_USER is required")

    password = getenv("DB_PASS")
    if not password:
        raise ValueError("DB_PASS is required")

    host = getenv("DB_HOST", "localhost")

    _port_raw = getenv("DB_PORT", "5432")
    
    # checks that port is an int
    try:
        port_int = int(_port_raw)
    except (TypeError, ValueError):
        raise ValueError(f"DB_PORT must be an integer, got {_port_raw!r}")
    port = str(port_int)
    
    name = getenv("DB_NAME")
    if not name:
        raise ValueError("DB_NAME is required")

    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


def get_settings() -> Settings:
    return Settings(db_url=_build_db_url())


__all__ = ["Settings", "get_settings"]
