FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
COPY README.md .


RUN pip install --upgrade pip
RUN pip install --no-cache-dir ".[test]"
RUN apt-get update && apt-get install -y postgresql-client

COPY . .

ENV PYTHONPATH=/app

RUN adduser --system appuser
USER appuser

EXPOSE 8000

CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--workers", "4", "--bind", "0.0.0.0:8000"]