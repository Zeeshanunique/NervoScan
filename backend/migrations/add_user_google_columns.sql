-- Add Google OAuth columns to users table (run if upgrading from pre-login version)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
ALTER TABLE users ALTER COLUMN anonymous_id TYPE VARCHAR(128);
CREATE INDEX IF NOT EXISTS ix_users_google_id ON users(google_id);
