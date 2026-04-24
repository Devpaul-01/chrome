FROM python:3.11-slim

WORKDIR /app

# System deps first (changes rarely, cached well)

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for better caching
COPY pyproject.toml README.md ./

# Install Python dependencies (pin pip below 26.0 — CVE-2026-3219 affects 26.0 and 26.0.1, no fix released yet)
RUN pip install "pip<26.0" && pip install --no-cache-dir ".[test]"

# Copy the rest of the source code
COPY . .

ENV PYTHONPATH=/app

RUN adduser --system appuser
USER appuser

EXPOSE 80

# Run migrations and start the app (dev/prod override via docker-compose if needed)
CMD ["bash", "-c", "alembic upgrade head && gunicorn -k uvicorn.workers.UvicornWorker app.main:app --workers 4 --bind 0.0.0.0:80"]