"""
create_tables_async.py — One-shot async script to create all database tables.

Runs ``Base.metadata.create_all`` through an async SQLAlchemy engine.  Note
that ORM models must already be imported before calling ``create_all`` so
their metadata is registered on ``Base``.  If tables are missing, prefer
``create_tables_async2.py`` which explicitly imports the models module first.

Usage:
    python create_tables_async.py
"""
import asyncio
from app.core.config import settings
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    engine = create_async_engine(settings.database_url, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print('Tables created')

if __name__ == '__main__':
    asyncio.run(main())
