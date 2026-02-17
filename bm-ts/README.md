# 🎂 BirthdayMessaging - Chrome Extension + Backend

Modern TypeScript implementation of BirthdayMessaging for automating Facebook birthday messages.

## 🚀 Quick Start (First Time)

```powershell
# From the bm-ts directory
.\startup.ps1
```

Then follow the instructions to load the extension in Chrome.

**Read [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for complete setup instructions and troubleshooting.**

## 📁 Project Structure

```
bm-ts/
├── startup.ps1              # 🚀 Start all services
├── shutdown.ps1             # 🛑 Stop all services  
├── DEVELOPMENT_GUIDE.md     # 📖 Complete development guide
├── backend/                 # FastAPI backend + PostgreSQL
│   ├── app/                 # Python application code
│   ├── .env                 # Backend configuration
│   └── docker-compose.yml   # Docker services
└── extension/               # Chrome Extension (Manifest V3)
    ├── src/                 # TypeScript source code
    ├── dist/                # Built extension (load in Chrome)
    ├── public/              # Static assets
```

## 🔄 Daily Workflow

### Start Development Session

```powershell
.\startup.ps1
```

### Make Frontend Changes

```powershell
cd extension
npm run reload
# Then reload extension in chrome://extensions/
```

### Make Backend Changes

Backend auto-reloads. Just save your files.

### End Development Session

```powershell
.\shutdown.ps1
```

## 📊 Useful Commands

### Check Services Status

```powershell
docker ps                              # Running containers
curl http://localhost:8000/health      # Backend health
```

### View Logs

```powershell
cd backend
docker-compose logs -f backend         # Backend logs
docker-compose logs -f db              # Database logs
```

### Database Access

```powershell
cd backend
docker exec -it backend-db-1 psql -U postgres -d birthdaymessaging
```

## 🐛 Common Issues

### "Message port closed"

**Fix:** Reload extension in `chrome://extensions/` after rebuilding.

### Backend not responding

```powershell
cd backend
docker-compose restart backend
docker-compose logs backend
```

### Extension won't load

Ensure you're loading the `extension/dist` folder, not `extension`.

## 🛠️ Technology Stack

### Backend
- **Framework:** FastAPI (Python)
- **Database:** PostgreSQL 15
- **Auth:** JWT (access + refresh tokens)
- **Payments:** Stripe
- **Container:** Docker + Docker Compose

### Frontend (Extension)
- **UI:** React 18 + TypeScript
- **Styling:** Tailwind CSS v4
- **Build:** Vite 7
- **Manifest:** V3 (service worker)

## 📋 Features

- ✅ User authentication (register/login)
- ✅ Template management (greetings, body, closings)
- ✅ Stripe subscription integration
- ✅ Facebook birthday detection
- ✅ Message scheduling and queue
- ✅ Message history tracking
- ✅ Dashboard statistics
- ✅ Password reset flow
- ✅ Automation schedules

## 🔐 Environment Variables

Backend `.env` (auto-created by startup script):

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/birthdaymessaging
JWT_SECRET_KEY=dev-secret-key-change-in-production
STRIPE_API_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY=price_monthly
STRIPE_PRICE_YEARLY=price_yearly
CORS_ORIGINS=chrome-extension://*,http://localhost:3000
```

## 🧪 Testing

```powershell
# Backend tests (TODO)
cd backend
pytest

# Frontend linting
cd extension
npm run lint
npm run format
```

## 📚 Documentation

- [QUICK_START.md](QUICK_START.md) - Complete development guide
- [backend/README.md](backend/README.md) - Backend API documentation
- [extension/README.md](extension/README.md) - Extension architecture

## 🤝 Contributing

1. Make changes in your feature branch
2. Run `npm run lint` and `npm run format` before committing
3. Test both backend and frontend
4. Ensure extension builds without errors

## 📝 License

[Add license information]

## 🆘 Need Help?

1. Review backend logs: `docker-compose logs backend`
2. Check browser console for frontend errors
3. Verify services are running: `docker ps`

---

**Happy Birthday Messaging! 🎉**
