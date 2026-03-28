# Authentication & Authorization System

## Overview

NervoScan implements standard authentication requiring login for all core features:
- **Login required for all features** (assessments, reports, admin)
- Username/password registration and login
- Google OAuth login
- Role-based access control (RBAC)
- JWT token-based authentication
- Protected routes with Next.js middleware
- Secure API endpoints with token validation

## User Roles

### Regular Users
- Can take stress assessments (requires login)
- View their own assessment history (requires login)
- Export their own reports as PDF/CSV (requires login)
- Cannot access admin dashboard
- Cannot view other users' data

### Admin Users
- All regular user permissions
- Access to admin dashboard (`/admin`)
- View all users and assessments
- System statistics and analytics

## Database Schema

### User Model
```python
class User(Base):
    id: UUID
    anonymous_id: str  # Kept for backwards compatibility
    google_id: str | None
    email: str | None
    name: str | None
    avatar_url: str | None
    password_hash: str | None  # For username/password auth
    is_admin: bool = False  # Admin role flag
    created_at: datetime
    locale: str
```

## JWT Token Structure

```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "is_admin": true,
  "exp": 1234567890,
  "iat": 1234567890
}
```

## Protected Routes

### Frontend (Next.js Middleware)

`frontend/middleware.ts` protects:
- `/assessment/*` - Requires authentication
- `/reports/*` - Requires authentication
- `/admin/*` - Requires authentication + admin role

**Middleware flow:**
1. Extract JWT from cookies or Authorization header
2. Validate token via `/auth/me` endpoint
3. For admin routes: verify `is_admin` flag
4. Redirect to `/login?redirect={path}` if unauthorized
5. Return user to original destination after login

### Backend API Endpoints

**Assessment endpoints (require authentication):**
- `POST /assessment/start` - Start assessment
- `POST /assessment/final` - Submit final analysis

**Report endpoints (require authentication):**
- `GET /reports/{user_id}` - User's assessment history
- `GET /export/pdf` - Export assessment as PDF
- `GET /export/csv` - Export history as CSV

**Admin endpoints (require admin role):**
- `GET /admin/stats` - Dashboard statistics
- `GET /admin/users` - List all users
- `GET /admin/assessments` - List all assessments

**Public endpoints:**
- `POST /auth/login` - Login
- `POST /auth/register` - Register
- `GET /auth/google` - Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/me` - Verify token

## Authentication Flow

### Standard Login Flow

1. **User accesses protected route** (e.g., `/assessment`)
2. **Middleware checks token** - Not found, redirects to `/login?redirect=/assessment`
3. **User chooses auth method:**
   - Username/password: Enter credentials
   - Google OAuth: Click "Sign in with Google"
4. **Backend validates and creates JWT token**
5. **Frontend stores token** in localStorage as `nervoscan_token`
6. **Redirects to original destination** (e.g., `/assessment`)

### Google OAuth Flow

1. User clicks "Sign in with Google" at `/login?redirect=/assessment`
2. Frontend redirects to `/auth/google?redirect=/assessment`
3. Backend builds Google OAuth URL with state containing redirect path
4. User authenticates with Google
5. Google redirects to `/auth/google/callback?code=...&state=...`
6. Backend validates code, creates/updates user, generates JWT
7. Redirects to `/login?token=...&success=1&redirect=/assessment`
8. Frontend stores token and redirects to `/assessment`

### Password Authentication Flow

1. User enters email/password at `/login`
2. Frontend sends POST to `/auth/register` or `/auth/login`
3. Backend validates credentials:
   - For login: Check password hash matches
   - For register: Create new user with hashed password
4. Backend creates JWT with `is_admin` flag
5. Frontend stores token and redirects

## Security Features

### Password Security
- Passwords hashed with bcrypt (via passlib)
- Truncated to 72 bytes before hashing
- Never stored in plain text
- Never returned in API responses

### Token Security
- JWT tokens signed with secret key
- Configurable expiration (default: 7 days)
- Tokens validated on every protected request
- Tokens stored client-side in localStorage

### Data Isolation
- Users can only access their own assessments
- Reports endpoint validates user_id matches token
- Export endpoints verify ownership
- Admin endpoints require explicit `is_admin` flag

### CORS Protection
- Backend validates Origin header
- Only allows configured frontend URLs
- Prevents unauthorized API access

## Creating Admin Users

Use the included script to create or promote admin users:

```bash
cd backend
python create_admin.py admin@example.com SecurePassword123 "Admin Name"
```

The script will:
- Create a new admin user if email doesn't exist
- Promote existing user to admin if email exists
- Hash the password securely
- Set `is_admin=True`

## UI Features

### Dynamic Navigation
- Navbar shows "Sign In" when not authenticated
- Shows user info + "Logout" when authenticated
- Admin link only visible to admin users
- Updates in real-time when auth state changes

### Home Page
- Shows "Sign In to Start" / "Create Account" when not authenticated
- Shows "Start Assessment" / "View History" when authenticated
- Adapts UI based on authentication state

### Protected Pages
- Assessment page requires login before starting
- Reports page requires login to view history
- Admin page requires login + admin role
- All redirect to login with return URL

## Error Handling

### Frontend
- 401 errors redirect to login page
- 403 errors redirect to home with error message
- Token validation happens on mount and before operations
- Graceful error messages for network issues

### Backend
- 401: Invalid/missing token → "Authentication required"
- 403: Valid token but insufficient permissions → "Admin access required"
- 404: Resource not found → "User/Assessment not found"
- Detailed error messages for debugging

## Testing

### Create Test Users

```bash
# Create regular user
cd backend
python create_admin.py user@test.com password123 "Test User"

# Update user to admin
python create_admin.py user@test.com password123 "Admin User"
```

### Test Authentication

1. **Visit home page**: Should show "Sign In to Start"
2. **Try to access `/assessment`**: Redirects to login
3. **Try to access `/reports`**: Redirects to login
4. **Login with test user**: Should redirect back to intended page
5. **Check navbar**: Shows user info and logout button
6. **Try admin page**: Regular user gets 403, admin user sees dashboard

### Test Authorization

1. **Login as regular user**: Can access assessment/reports, cannot access admin
2. **Login as admin user**: Can access everything including `/admin`
3. **Try to view another user's reports**: API returns 403
4. **Try to export another user's data**: API returns 403

## Environment Variables

### Backend (`.env`)
```
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FRONTEND_URL=http://localhost:3000
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## API Authentication Examples

### Making Authenticated Requests

```typescript
// Frontend example
const token = getStoredToken();
const response = await fetch(`${API_URL}/reports/user-id-here`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Backend Dependency Usage

```python
# Require any authenticated user
@router.get("/protected")
async def protected_route(user: User = Depends(get_current_user)):
    return {"user_id": str(user.id)}

# Require admin user
@router.get("/admin/data")
async def admin_route(admin: User = Depends(require_admin)):
    return {"data": "sensitive"}
```

## Migration Notes

If upgrading from a previous version:
1. Delete `backend/nervoscan.db` to recreate schema with `is_admin` column
2. Run `python create_admin.py` to create admin users
3. Existing anonymous users can register/login to link their data
4. All routes now require authentication by default
