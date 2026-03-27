# Railway Environment Variables Configuration

## Backend Service Environment Variables
Copy these to your Railway Backend Service:

```
DATABASE_URL=postgresql+asyncpg://username:password@hostname:port/database
DATABASE_URL_SYNC=postgresql://username:password@hostname:port/database
DEBUG=false
CORS_ORIGINS=["https://nervoscan-frontend-production.up.railway.app"]
FRONTEND_URL=https://nervoscan-frontend-production.up.railway.app
BACKEND_URL=https://nervoscan-production.up.railway.app
JWT_SECRET=<generate-secure-random-string-32-chars>
JWT_EXPIRE_MINUTES=10080
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
```

## Frontend Service Environment Variables
Copy these to your Railway Frontend Service:

```
NEXT_PUBLIC_API_URL=https://nervoscan-production.up.railway.app
NEXT_PUBLIC_WS_URL=wss://nervoscan-production.up.railway.app
GEMINI_API_KEY=AIzaSyDUo0rQyLwUefDovdGx6qixTow6ANUyJ78
```

## Steps to Configure:

### 1. Add PostgreSQL Database
1. Go to your Railway project dashboard
2. Click "New" → "Database" → "Add PostgreSQL"
3. Copy the DATABASE_URL from the PostgreSQL service
4. Update the backend environment variables with the correct URLs

### 2. Create Backend Service
1. In Railway dashboard, click "New" → "Empty Service"
2. Name it "NervoScan-Backend"
3. Go to Settings → Service Settings
4. Set Root Directory: `/backend`
5. Add all backend environment variables above
6. The DATABASE_URL will be automatically available from PostgreSQL plugin

### 3. Create Frontend Service
1. Click "New" → "Empty Service"
2. Name it "NervoScan-Frontend"
3. Go to Settings → Service Settings
4. Set Root Directory: `/frontend`
5. Add all frontend environment variables above
6. Update NEXT_PUBLIC_API_URL with your actual backend URL after deployment

### 4. Deploy
1. Both services should auto-deploy on git push
2. Backend will be available at: https://nervoscan-production.up.railway.app
3. Frontend will be available at: https://nervoscan-frontend-production.up.railway.app

### 5. Update CORS
After frontend deploys, update backend's CORS_ORIGINS with the actual frontend URL

## Important Notes:
- Generate a secure JWT_SECRET: `openssl rand -base64 32`
- Update Google OAuth redirect URIs in Google Cloud Console with your production URLs
- Use `wss://` for WebSocket URL (not `ws://`) in production
- Make sure to add Railway's PostgreSQL connection string (it will have `+asyncpg` for async operations)
