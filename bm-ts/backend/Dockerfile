FROM python:3.11-slim

WORKDIR /app

# System deps first (changes rarely, cached well)
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest first for pip layer caching
COPY pyproject.toml README.md ./

# Copy source, then install (setuptools needs app/ to discover packages)
COPY . .

RUN pip install --upgrade pip && pip install --no-cache-dir "."

ENV PYTHONPATH=/app

RUN adduser --system appuser
USER appuser

EXPOSE 80

# Production (Coolify): gunicorn on port 80 via gunicorn.conf.py
# Dev override: docker-compose command uses single-worker uvicorn on port 8000 + reload
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app.main:app"]