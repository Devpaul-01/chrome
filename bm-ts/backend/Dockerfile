FROM python:3.11-slim@sha256:9f6ef439f51f4b36dc5c6bb265c2d3dd810bde94c5bbec77ae86b6650c488cf9

WORKDIR /app

# System deps first (changes rarely, cached well)

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for better caching
COPY pyproject.toml README.md constraints.lock ./

# Install Python dependencies (pin pip below 26.0 — CVE-2026-3219 affects 26.0 and 26.0.1, no fix released yet)
RUN pip install "pip==24.0" && pip install --no-cache-dir -c constraints.lock ".[test]"

# Copy the rest of the source code
COPY . .

ENV PYTHONPATH=/app \
    HOME=/home/appuser

# Gunicorn 26 creates its control socket below the current user's home.
# Give the unprivileged runtime user a real, writable home instead of Debian's
# default /nonexistent so the control server can start cleanly.
RUN adduser --system --home "${HOME}" appuser
USER appuser

EXPOSE 80

# Run migrations and start the app (dev/prod override via docker-compose if needed)
CMD ["bash", "-c", "alembic upgrade head && gunicorn -k uvicorn.workers.UvicornWorker app.main:app --workers 4 --bind 0.0.0.0:80"]
