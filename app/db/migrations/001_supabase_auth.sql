-- Link Supabase Auth users to local users; allow password-less rows when using Supabase.
-- Run after schema.sql / on existing DBs: psql $DATABASE_URL -f db/migrations/001_supabase_auth.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id UUID UNIQUE;

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_password_or_supabase;
ALTER TABLE users ADD CONSTRAINT users_password_or_supabase
  CHECK (password_hash IS NOT NULL OR supabase_user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_users_supabase ON users(supabase_user_id);
