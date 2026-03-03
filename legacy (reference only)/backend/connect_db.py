from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import select

root = Path(__file__).resolve().parent.parent
path = str(root)
if path not in sys.path:
    sys.path.insert(0, path)

from backend.config import get_settings
from backend.database import init_engine, session_scope
from backend.models import User


def main() -> None:
    settings = get_settings()
    init_engine(settings.db_url)

    with session_scope() as session:
        rows = session.scalars(select(User)).all()
        for row in rows:
            print(row)


if __name__ == "__main__":
    main()
