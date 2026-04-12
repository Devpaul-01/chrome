# 🎂 BirthdayMessaging Development Guide

Complete guide for developing the BirthdayMessaging Chrome extension with FastAPI backend.

---

## 📋 Table of Contents

1. [Quick Start](#-quick-start)
2. [Prerequisites](#-prerequisites)
3. [First-Time Setup](#-first-time-setup)
4. [Daily Workflow](#-daily-workflow)
5. [Troubleshooting](#-troubleshooting)
6. [Command Reference](#-command-reference)
7. [Debugging](#-debugging)
8. [Architecture](#-architecture)
9. [What Was Fixed](#-what-was-fixed)

---

## 🚀 Quick Start

**Already set up? Here's your daily workflow:**

```powershell
# Start everything (Docker + Backend + Build extension)
cd bm-ts
.\startup.ps1

# After making frontend changes
cd extension
npm run reload             # Then reload extension in chrome://extensions/

# Backend changes auto-reload (just save files)

# End of day
cd bm-ts
.\shutdown.ps1
```

---

## ✅ Prerequisites

Before starting, ensure you have:

- **Docker Desktop** - Must be running (shows steady whale icon in system tray)
- **Node.js 18+** - For building the Chrome extension (ensure that "Add to PATH" is selected when installing node.js)
- **Chrome Browser** - For running the extension

**No Python installation needed** - All Python dependencies run inside Docker.

### Verify Prerequisites

```powershell
docker --version    # Should show Docker version 20+
node --version      # Should show Node v18+ 
```

---

## 🔧 First-Time Setup

### 1. Start Everything

```powershell
cd bm-ts
.\startup.ps1
```

**This script automatically:**
- ✅ Checks Docker is running
- ✅ Starts PostgreSQL database (port 5432)
- ✅ Starts FastAPI backend (port 8000)
- ✅ Installs npm dependencies
- ✅ Builds extension to `extension/dist/`
- ✅ Shows you next steps

**Wait for:** "All done! Load extension/dist in Chrome"

**Important:** After starting, wait 5-10 seconds for the backend to fully initialize before using the extension. You can verify it's ready:
```powershell
curl http://localhost:8000/health
# Should return: {"status":"ok"}
```

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **"Load unpacked"** button
4. Navigate to and select: `bm-ts\extension\dist` folder
5. Extension appears with BirthdayMessaging icon ✓

**Important:** Select the `dist` folder, not the `extension` folder!

### 3. Test the Extension

1. Click the extension icon in Chrome toolbar
2. Register a new account or login
3. Backend will register user in PostgreSQL database

**Test credentials (if you ran backend earlier):**
- Email: `test@example.com`
- Password: `Test123456!`

---

## 🔄 Daily Workflow

### Starting Your Day

```powershell
cd bm-ts
.\startup.ps1
```

Services that start:
- **PostgreSQL** → `localhost:5432`
- **Backend API** → `localhost:8000`
- **Extension built** → `extension/dist/`

### Making Frontend Changes

1. Edit files in `extension/src/`
2. Build: `cd extension && npm run reload`
3. **Critical:** Reload extension in Chrome:
   - Go to `chrome://extensions/`
   - Find BirthdayMessaging
   - Click 🔄 reload icon
4. Close and reopen extension popup to see changes

**Why reload?** Chrome caches the old extension code. Extensions are static files, not servers.

### Making Backend Changes

1. Edit files in `backend/app/`
2. **Save the file** - Backend auto-reloads!
3. Check logs: `cd backend && docker-compose logs -f backend`

**No restart needed** - Docker volume mounts enable hot reload.

### Ending Your Day

```powershell
cd bm-ts
.\shutdown.ps1
```

Stops all Docker containers cleanly.

**Important:** Your database data persists between restarts! When you shutdown:
- ✅ Containers are stopped and removed
- ✅ Database volume (with all users, templates, etc.) remains intact
- ✅ Extension stays loaded in Chrome

**After computer restart:**
1. Open VSCode
2. Run `.\startup.ps1` (~8 seconds)
3. Everything works - no reconfiguration needed!
4. All user accounts preserved
5. Extension already loaded in Chrome

---

## 🐛 Troubleshooting

---

### "Message port closed before a response was received"

**Cause:** Extension code changed but Chrome still using old cached version.

**Fix:**
1. Go to `chrome://extensions/`
2. Find BirthdayMessaging
3. Click 🔄 reload icon
4. Close and reopen extension popup

### Backend Not Responding

**Check status:**
```powershell
docker ps    # Should show backend-db-1 and backend-backend-1
```

**Test health:**
```powershell
curl http://localhost:8000/health
# Should return: {"status":"ok"}
```

**Fix:**
```powershell
cd bm-ts\backend
docker-compose restart backend
docker-compose logs backend    # Check for errors
```

### Database Connection Failed

**Fix:**
```powershell
cd bm-ts\backend
docker-compose down
docker-compose up -d
```

### Extension Not Loading in Chrome

**Checklist:**
- [ ] Did you run `npm run build`?
- [ ] Are you loading the `dist` folder (not `extension`)?
- [ ] Any errors in `chrome://extensions/` page?
- [ ] Try: Remove extension → Reload page → Add again

### Login Returns "Server Error" (500)

**Cause:** Backend may not be fully ready yet, or database connection issue.

**Fix:**
1. Wait 5-10 seconds after running `startup.ps1`
2. Verify backend health:
   ```powershell
   curl http://localhost:8000/health
   # Should return: {"status":"ok"}
   ```
3. Check backend is responding:
   ```powershell
   cd backend
   docker-compose logs backend --tail=20
   ```
4. If database connection issues, restart:
   ```powershell
   docker-compose restart backend
   ```

**Prevention:** Always wait for the "All done!" message before trying to use the extension.

### Docker Not Running

**Symptoms:** `startup.ps1` fails with "Docker is not running"

**Fix:**
1. Open Docker Desktop from Start menu
2. Wait for whale icon to be steady (not animated)
3. Run `.\startup.ps1` again

### Port Already in Use

---

## 📊 Command Reference

### Startup Scripts

```powershell
# Start everything (Docker, backend, build extension)
cd bm-ts
.\startup.ps1

# Stop all services
.\shutdown.ps1


### Backend Commands

```powershell
cd bm-ts\backend

# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Rebuild containers (after dependency changes)
docker-compose up -d --build

# View logs (live)
docker-compose logs -f backend

# View database logs
docker-compose logs -f db

# Restart backend only
docker-compose restart backend

# Access database CLI
docker exec -it backend-db-1 psql -U postgres -d birthdaymessaging

# List database tables
docker exec backend-db-1 psql -U postgres -d birthdaymessaging -c "\dt"

# Check database users
docker exec backend-db-1 psql -U postgres -d birthdaymessaging -c "SELECT email, created_at FROM users;"
```

### Frontend Commands

```powershell
cd bm-ts\extension

# Install dependencies (first time)
npm install

# Build for production
npm run build

# Build + show reload reminder
npm run reload

# Build and watch for changes
npm run build:watch

# Run extension tests (360 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

### Database Commands

```powershell
# Full database reset
cd bm-ts\backend
docker-compose down -v    # -v removes volumes (deletes data!)
docker-compose up -d      # Recreates database with fresh schema
```

### Database Migrations (Alembic)

All schema changes must go through Alembic migrations so that
every environment stays in sync.

```powershell
# Run inside the backend Docker container:
docker exec -it backend-backend-1 bash

# Apply all pending migrations
alembic upgrade head

# Check current migration version
alembic current

# Auto-generate a migration after modifying models.py
alembic revision --autogenerate -m "describe_your_change"

# Roll back the last migration
alembic downgrade -1
```

**Workflow for schema changes:**

1. Edit `backend/app/db/models.py` with your new columns / tables.
2. Run `alembic revision --autogenerate -m "short_description"` inside the container.
3. Review the generated file under `alembic/versions/` — auto-gen is not perfect.
4. Apply with `alembic upgrade head`.
5. Commit the migration file alongside the model change.

### Email / SendGrid Setup

Password reset emails are sent via the [SendGrid](https://sendgrid.com/) API.
To enable email sending in development:

1. Create a free SendGrid account and generate an API key.
2. Add the following to `backend/.env`:

```dotenv
SENDGRID_API_KEY=SG.your_key_here
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
PASSWORD_RESET_URL_BASE=http://localhost:5173/reset-password
```

3. Verify your sender identity in the SendGrid dashboard (required by SendGrid).
4. Password reset tokens expire after **30 minutes** and are stored as SHA-256 hashes.

---

## 🔍 Debugging

### Backend Debugging

**View logs:**
```powershell
cd bm-ts\backend
docker-compose logs -f backend
```

**Test API directly:**
```powershell
# Health check
Invoke-RestMethod -Uri http://localhost:8000/health

# Register user
$body = @{ email = "test@test.com"; password = "Test123!" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8000/auth/register" -Method Post -Body $body -ContentType "application/json"

# Login
$body = @{ email = "test@test.com"; password = "Test123!" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8000/auth/login" -Method Post -Body $body -ContentType "application/json"
```

**API Documentation:**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Frontend Debugging

**Popup debugging:**
1. Click extension icon to open popup
2. Right-click anywhere in popup → **Inspect**
3. DevTools Console shows errors and logs

**Background script debugging:**
1. Go to `chrome://extensions/`
2. Find BirthdayMessaging
3. Click **"service worker"** link
4. Console shows background script logs with structured logging:
   - ℹ️ Info messages
   - ✅ Success messages  
   - ⚠️ Warnings
   - ❌ Errors with context

**Content script debugging:**
1. Open Facebook in Chrome
2. Press F12 to open DevTools
3. Check Console for extension messages on Facebook

---

## 🏗️ Architecture

### Project Structure

```
bm-ts/
├── startup.ps1              # 🚀 Start all services
├── shutdown.ps1             # 🛑 Stop all services
├── README.md                # Quick overview
├── DEVELOPMENT_GUIDE.md     # This file
├── backend/                 # FastAPI backend
│   ├── .env                 # Backend config (auto-created)
│   ├── docker-compose.yml   # Docker services definition
│   ├── Dockerfile           # Backend container image
│   ├── pyproject.toml       # Python dependencies
│   └── app/                 # Python application code
│       ├── main.py          # FastAPI app entry point
│       ├── api/             # API route handlers
│       ├── core/            # Security, config
│       ├── db/              # Database connection
│       ├── schemas/         # Pydantic models
│       └── services/        # Business logic
└── extension/               # Chrome Extension (Manifest V3)
    ├── dist/                # 📦 Built extension (load in Chrome!)
    ├── src/                 # TypeScript source code
    │   ├── popup/           # Extension popup UI (React)
    │   ├── background/      # Service worker
    │   ├── content/         # Facebook page scripts
    │   ├── api/             # API client
    │   └── utils/           # Helpers, storage, logger
    ├── public/              # Static assets
    │   ├── manifest.json    # Extension metadata
    │   └── images/          # Icons
    ├── package.json         # npm dependencies & scripts
    ├── vite.config.ts       # Build configuration
```

### Technology Stack

**Backend:**
- FastAPI (Python) - Web framework
- PostgreSQL 15 - Database
- SQLAlchemy 2.0 - ORM
- JWT - Authentication
- Stripe - Payments
- Argon2 - Password hashing
- Docker - Containerization

**Frontend:**
- React 18 - UI framework
- TypeScript - Type safety
- Tailwind CSS v4 - Styling
- Vite 7 - Build tool
- Chrome Extension Manifest V3

### What Runs Where

| Service | Location | Port | Auto-reload? |
|---------|----------|------|--------------|
| PostgreSQL | Docker container | 5432 | No |
| Backend API | Docker container | 8000 | Yes (volume mount) |
| Extension | Chrome browser | N/A | No (manual reload) |

**Important:** The extension is **not a server**. It's static files loaded by Chrome. After rebuilding, you must manually reload it in `chrome://extensions/`.

---

## 🎯 What Was Fixed

Recent improvements to prevent recurring issues:

### 1. Backend Password Hashing
**Problem:** bcrypt library caused initialization crashes  
**Fix:** Switched to argon2 (more secure, no issues)  
**Files:** `backend/pyproject.toml`, `backend/app/core/security.py`

### 2. Extension Message Port Errors
**Problem:** Background service worker async handling was broken  
**Fix:** Proper promise-based message handling with response validation  
**Files:** `extension/src/background/index.ts`, `extension/src/utils/bridge.ts`

### 3. Forgot to Reload Extension
**Problem:** Developers forgot to reload extension after rebuilding  
**Fix:** Reload extension in browser, manage extension

### 4. Complex Setup Process
**Problem:** Manual multi-step setup was error-prone  
**Fix:** Single `startup.ps1` script does everything automatically

### 5. Poor Error Messages
**Problem:** Hard to debug issues  
**Fix:** Added structured logging with emojis and context  
**Files:** `extension/src/utils/logger.ts`, `extension/src/background/index.ts`

---

## 📝 Best Practices

### Before Each Work Session

1. ✅ Run `.\startup.ps1`
2. ✅ Verify backend health: `curl http://localhost:8000/health`
3. ✅ If extension was already loaded, reload it in Chrome

### After Making Changes

**Backend:**
- Just save files - auto-reloads via Docker volume mount
- Check logs if something breaks: `docker-compose logs backend`

**Frontend:**
1. Run `npm run build` (or `npm run reload`)
2. Reload extension in `chrome://extensions/`
3. Close and reopen extension popup

### Before Committing Code

```powershell
cd bm-ts\extension

# Format code
npm run format

# Check for errors
npm run lint

# Ensure it builds
npm run build
```

---

## 🔐 Configuration

### Backend Environment Variables

File: `backend/.env` (auto-created by `startup.ps1`)

```env
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/birthdaymessaging

# JWT Authentication
JWT_SECRET_KEY=dev-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# Stripe (optional - use test keys)
STRIPE_API_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY=price_monthly
STRIPE_PRICE_YEARLY=price_yearly

# CORS - allows Chrome extension to call API
CORS_ORIGINS=chrome-extension://*,http://localhost:3000

# Logging
LOG_LEVEL=INFO
```

**Important:** If you get a new extension ID, update `CORS_ORIGINS` in `.env`.

### Extension Configuration

Backend URL is stored in `chrome.storage.local` (defaults to `http://localhost:8000`).

To change it:
1. Open extension popup
2. Look for backend URL setting (if available in UI)
3. Or use Chrome DevTools → Application → Storage → Local Storage

---

## 🆘 Getting Help

If you encounter issues not covered here:

1. **Check logs:**
   ```powershell
   cd bm-ts\backend
   docker-compose logs backend --tail=50
   ```

2. **Verify services:**
   ```powershell
   docker ps    # Should show 2 containers running
   ```

3. **Check browser console:**
   - Popup: Right-click → Inspect
   - Background: `chrome://extensions/` → service worker

4. **Try clean restart:**
   ```powershell
   cd bm-ts
   .\shutdown.ps1
   docker system prune -f    # Cleanup
   .\startup.ps1
   ```

5. **Database issues? Reset it:**
   ```powershell
   cd bm-ts\backend
   docker-compose down -v    # Deletes data!
   docker-compose up -d      # Fresh start
   ```

---

## 🎓 Tips & Tricks

**Keep terminals organized:**
- Terminal 1: Backend logs (`docker-compose logs -f backend`)
- Terminal 2: Main work (editing, building, git)
- Terminal 3: Database commands (when needed)

**Browser DevTools shortcuts:**
- `Ctrl+Shift+I` - Open DevTools
- `Ctrl+R` - Reload page
- `F12` - Toggle DevTools

**VS Code extensions (recommended):**
- Docker (manage containers from VS Code)
- Pylance (Python IntelliSense)
- ESLint (JavaScript linting)
- Prettier (code formatting)

**Git workflow:**
```powershell
# Good commit message
git commit -m "feat: add birthday schedule editing"
git commit -m "fix: resolve message port error in background script"
git commit -m "docs: update setup instructions"
```

---

## ✅ Success Checklist

After setup, you should have:

- [ ] Docker running (check system tray icon)
- [ ] Backend responding at http://localhost:8000/health
- [ ] Database accessible: `docker exec -it backend-db-1 psql -U postgres -d birthdaymessaging`
- [ ] Extension loaded in Chrome at `chrome://extensions/`
- [ ] Extension icon visible in Chrome toolbar
- [ ] Can register/login through extension
- [ ] Frontend changes → build → reload → works
- [ ] Backend changes → save → auto-reloads

**If all checked ✓, you're ready to develop!** 🚀

**Remember:** Your database data persists between restarts. After shutdown:
- User accounts remain in database
- Templates and settings preserved
- Extension stays loaded in Chrome
- Just run `.\startup.ps1` to continue working!

---

## 📚 Additional Resources

- **Backend README:** [backend/README.md](backend/README.md)
- **Extension README:** [extension/README.md](extension/README.md)
- **API Documentation:** http://localhost:8000/docs (when backend running)
- **Database Schema:** Managed by Alembic migrations (`backend/alembic/`)

---

**Happy coding! 🎉**
