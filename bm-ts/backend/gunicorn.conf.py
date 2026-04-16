"""
gunicorn.conf.py — Production Gunicorn configuration for BirthdayMessaging backend.

Used by Dockerfile CMD: gunicorn -c gunicorn.conf.py app.main:app
Not used in dev (docker-compose overrides CMD with single-worker uvicorn).
"""

# ── Server socket ─────────────────────────────────────────
bind = "0.0.0.0:8000"

# ── Worker processes ──────────────────────────────────────
workers = 4
worker_class = "uvicorn.workers.UvicornWorker"

# ── Timeouts ──────────────────────────────────────────────
timeout = 120           # Kill worker if no response within 120s
graceful_timeout = 30   # Time for graceful shutdown after SIGTERM
keepalive = 5           # Seconds to wait for next request on Keep-Alive

# ── Worker recycling (prevents slow memory leaks) ─────────
max_requests = 1000
max_requests_jitter = 50

# ── Logging ───────────────────────────────────────────────
accesslog = "-"         # stdout
errorlog = "-"          # stderr
loglevel = "info"
