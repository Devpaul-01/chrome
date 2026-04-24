"""
Root-level conftest.py — runs before any test collection.

Sets test-safe environment variables so the pydantic Settings validators in
app/core/config.py don't reject placeholder defaults during test runs.
os.environ.setdefault() is used so any real secrets already present in the
environment (e.g. from CI secrets) take priority.
"""
import os

os.environ.setdefault(
    "JWT_SECRET_KEY",
    "ci-test-only-secret-not-for-production-minimum32chars",
)
os.environ.setdefault("STRIPE_API_KEY", "sk_test_ci_dummy_not_real")
os.environ.setdefault(
    "SMTP_ENCRYPTION_KEY",
    "ZmDfcTF7_60GrrY167zsiPd67pEvs0aGOv2oasOM1Pg=",  # valid Fernet key, CI/test only
)
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
