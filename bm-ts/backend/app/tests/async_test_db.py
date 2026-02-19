import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:password@localhost:5432/birthdaymessaging"

TABLES = [
    "birthday_configs",
    "birthday_schedules",
    "contacts",
    "message_groups",
    "message_history",
    "message_queue",
    "message_templates",
    "password_reset_tokens",
    "posts",
    "smtp_configs",
    "subscription_records",
    "template_segments",
    "user_images",
    "users",
]

async def test_tables():
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        print("Connected successfully!")

        for table in TABLES:
            print(f"\nChecking table: {table}")

            # 1. Check if table exists
            exists_query = text(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public'
                    AND table_name = '{table}'
                );
            """)
            exists = (await conn.execute(exists_query)).scalar()

            if not exists:
                print(f"Table '{table}' does NOT exist")
                continue

            print(f"Table '{table}' exists")

            # 2. Try a simple SELECT
            try:
                result = await conn.execute(text(f"SELECT * FROM {table} LIMIT 1;"))
                rows = result.fetchall()
                print(f"Query OK — sample rows: {rows}")
            except Exception as e:
                print(f"Query failed on '{table}': {e}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_tables())
