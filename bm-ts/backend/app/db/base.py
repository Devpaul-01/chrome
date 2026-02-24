"""
db/base.py — SQLAlchemy declarative base.

All ORM models in ``db/models.py`` inherit from ``Base``.  Importing this
module before calling ``Base.metadata.create_all`` (or running Alembic
migrations) ensures every mapped class is registered in the metadata.
"""

from sqlalchemy.orm import declarative_base

Base = declarative_base()
