"""
create_tables.py — One-shot synchronous script to create all database tables.

Uses a synchronous ``create_engine`` (asyncpg URL rewritten to plain psycopg2
format) so it can be run without an async event loop.  Intended for local
development bootstrapping only.  For production, use Alembic migrations.

Usage:
    python create_tables.py
"""
from app.db.base import Base
from app.core.config import settings
from sqlalchemy import create_engine

sync_db_url = settings.database_url.replace("+asyncpg", "")
engine = create_engine(sync_db_url)
Base.metadata.create_all(bind=engine)
print("Tables created")
