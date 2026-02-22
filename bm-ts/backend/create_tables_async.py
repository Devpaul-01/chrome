import asyncio
from app.db.base import Base
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
