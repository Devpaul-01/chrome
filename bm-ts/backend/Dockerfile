FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
COPY README.md .

RUN pip install --upgrade pip
RUN pip install --no-cache-dir ".[test]"
RUN apt-get update && apt-get install -y postgresql-client

COPY . .

ENV PYTHONPATH=/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
