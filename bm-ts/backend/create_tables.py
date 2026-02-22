from app.db.base import Base
from app.core.config import settings
from sqlalchemy import create_engine

sync_db_url = settings.database_url.replace("+asyncpg", "")
engine = create_engine(sync_db_url)
Base.metadata.create_all(bind=engine)
print("Tables created")
