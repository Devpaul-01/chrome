FROM python:3.13-slim
WORKDIR /app

COPY .  /app/backend

RUN pip install --no-cache-dir -r ./backend/requirements.txt gunicorn

ENV PYTHONUNBUFFERED=1

CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:5000", "backend.app:app"]