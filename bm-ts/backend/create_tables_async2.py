"""
create_tables_async2.py — One-shot async script to create all database tables (explicit model import).

Differs from ``create_tables_async.py`` in that it explicitly imports
``app.db.models`` before calling ``create_all``, guaranteeing every ORM
model is registered on ``Base.metadata`` regardless of import order.  Use
this version if tables are missing when running the simpler script.

Usage:
    python create_tables_async2.py
"""
import asyncio
# import models to ensure they are registered on Base.metadata
import app.db.models
from app.db.base import Base
from app.core.config import settings
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    engine = create_async_engine(settings.database_url, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print('Tables created (models imported)')

if __name__ == '__main__':
    asyncio.run(main())
