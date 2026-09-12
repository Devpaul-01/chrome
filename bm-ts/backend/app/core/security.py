"""
core/security.py — Password hashing and verification.

Uses Argon2 (via passlib) because it is the current OWASP-recommended
algorithm: memory-hard, configurable, and resistant to GPU cracking.
"""

from passlib.context import CryptContext

# Use argon2 for password hashing (more secure and modern than bcrypt)
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated=["bcrypt"])


def hash_password(raw_password: str) -> str:
    """Return an Argon2 hash of ``raw_password`` suitable for database storage."""
    return pwd_context.hash(raw_password)


def password_needs_rehash(hashed_password: str) -> bool:
    """Return True when a valid stored hash should be upgraded to the preferred scheme."""
    return pwd_context.needs_update(hashed_password)


def verify_password(raw_password: str, hashed_password: str) -> bool:
    """Return ``True`` if ``raw_password`` matches the stored ``hashed_password``."""
    return pwd_context.verify(raw_password, hashed_password)
