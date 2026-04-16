FROM python:3.11-slim

WORKDIR /app

# System deps first (changes rarely, cached well)
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*


RUN pip install --upgrade pip

COPY . .

RUN pip install --no-cache-dir .
ENV PYTHONPATH=/app

RUN adduser --system appuser

USER appuser

EXPOSE 80

# Keep Gunicorn settings inline so the container startup command remains self-contained.
# `--workers 4` uses a fixed worker count for this image, and `--bind 0.0.0.0:80`
# listens on all interfaces on port 80 so the app is reachable via container networking.
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--workers", "4", "--bind", "0.0.0.0:80"]