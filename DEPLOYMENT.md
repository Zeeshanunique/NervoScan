# NervoScan — Deployment Guide

## Prerequisites
- Docker + Docker Compose (recommended) **OR** Node.js 20+ and Python 3.11+
- PostgreSQL 16 (for production; SQLite is used for dev)

---

## Option 1: Docker Compose (Recommended)

```bash
# Clone and start
git clone <your-repo-url>
cd NervoScan

# Create .env for backend
cp backend/env.example backend/.env
# Edit backend/.env with your production values

# Build and start all services
docker compose up --build -d
```

**Services:**
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Option 2: Railway Deployment

1. Push your repo to GitHub
2. Create a new Railway project and connect the repo
3. Add a **PostgreSQL** plugin from Railway's marketplace
4. Create two services from the repo:

### Backend Service
- **Root Directory**: `/backend`
- **Environment Variables**:
  ```
  DATABASE_URL=<Railway PostgreSQL URL with +asyncpg>
  DATABASE_URL_SYNC=<Railway PostgreSQL URL>
  CORS_ORIGINS=["https://your-frontend-domain.railway.app"]
  FRONTEND_URL=https://your-frontend-domain.railway.app
  BACKEND_URL=https://your-backend-domain.railway.app
  JWT_SECRET=<generate-a-secure-random-string>
  GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
  GOOGLE_CLIENT_SECRET=<your-google-oauth-secret>
  ```

### Frontend Service
- **Root Directory**: `/frontend`
- **Environment Variables**:
  ```
  NEXT_PUBLIC_API_URL=https://your-backend-domain.railway.app
  NEXT_PUBLIC_WS_URL=wss://your-backend-domain.railway.app
  ```

5. Deploy both services
6. Estimated cost: **~$5–10/month**

---

## Option 3: Manual Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp env.example .env
# Edit .env with your values
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run build
npm start
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `sqlite+aiosqlite:///./nervoscan.db` | Async DB connection string |
| `DATABASE_URL_SYNC` | No | `sqlite:///./nervoscan.db` | Sync DB connection (migrations) |
| `CORS_ORIGINS` | Yes | `["http://localhost:3000"]` | Allowed CORS origins (JSON array) |
| `FRONTEND_URL` | Yes | `http://localhost:3000` | Frontend URL for OAuth redirects |
| `BACKEND_URL` | Yes | `http://localhost:8000` | Backend URL for OAuth callbacks |
| `JWT_SECRET` | **Yes** | `nervoscan-jwt-secret-change-in-production` | **Change in production!** |
| `JWT_EXPIRE_MINUTES` | No | `10080` (7 days) | Token TTL in minutes |
| `GOOGLE_CLIENT_ID` | No | `""` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | `""` | Google OAuth client secret |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:8000` | Frontend env: backend API URL |
| `NEXT_PUBLIC_WS_URL` | Yes | `ws://localhost:8000` | Frontend env: WebSocket URL |

---

## Production Checklist

- [ ] Change `JWT_SECRET` to a secure random string (min 32 chars)
- [ ] Set `CORS_ORIGINS` to your actual frontend domain only
- [ ] Use PostgreSQL instead of SQLite
- [ ] Enable HTTPS (Railway handles this automatically)
- [ ] Set `DEBUG=false` in backend
- [ ] Configure Google OAuth redirect URIs in Google Cloud Console
- [ ] Use `wss://` for WebSocket URL in production
- [ ] Set up monitoring and health checks (`/health` endpoint)
- [ ] Review Terms & Conditions content for your jurisdiction
