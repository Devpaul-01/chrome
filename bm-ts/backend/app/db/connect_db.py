"""
db/connect_db.py — Standalone script that initialises the database and prints all User rows.

Run directly (``python connect_db.py``) to verify connectivity and confirm
that ``Base.metadata.create_all`` can reach the target database.  Intended
for local development / debugging only — not imported by the application.
"""
import asyncio
from sqlalchemy import select

from base import Base
from db_config import get_settings
from database import get_engine, init_engine, async_session_scope
from models import User

async def main() -> None:
    settings = get_settings() # grabs database url from .env file
    init_engine(settings.db_url) # starts up database engine
    engine = get_engine() # creates variable for database engine

    async with engine.begin() as conn: # creates tables
        await conn.run_sync(Base.metadata.create_all)

    print("tables created") # for debugging


    # prints tables
    async with async_session_scope() as session:
        rows = await session.scalars(select(User))
        for row in rows:
            print(row)

    await engine.dispose() # cleans up database engine


if __name__ == "__main__":
    asyncio.run(main())
