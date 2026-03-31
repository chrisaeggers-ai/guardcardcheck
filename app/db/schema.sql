-- ================================================================
-- GuardCardCheck — Database Schema v2.0
-- Includes: users, organizations, subscriptions, usage, event packs,
--           verification logs, alerts, API keys
-- Run: psql -U postgres -d guardcardcheck -f schema.sql
-- ================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Organizations ─────────────────────────────────────────────
-- A user may belong to an organization (for Business/Enterprise teams)
CREATE TABLE IF NOT EXISTS organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  logo_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                   VARCHAR(255) UNIQUE NOT NULL,
  password_hash           TEXT,
  supabase_user_id        UUID UNIQUE,
  first_name              VARCHAR(100),
  last_name               VARCHAR(100),
  organization_id         UUID REFERENCES organizations(id),
  role                    VARCHAR(20) NOT NULL DEFAULT 'owner'
                          CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  
  -- Plan & Stripe
  plan                    VARCHAR(20) NOT NULL DEFAULT 'free'
                          CHECK (plan IN ('free', 'starter', 'business', 'enterprise')),
  stripe_customer_id      VARCHAR(100) UNIQUE,
  stripe_subscription_id  VARCHAR(100) UNIQUE,
  stripe_price_id         VARCHAR(100),
  subscription_status     VARCHAR(30) DEFAULT 'inactive',
                          -- 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
  billing_interval        VARCHAR(10) DEFAULT 'monthly', -- 'monthly' | 'annual'
  plan_expires_at         TIMESTAMPTZ,
  trial_ends_at           TIMESTAMPTZ,
  
  -- Auth
  email_verified          BOOLEAN NOT NULL DEFAULT FALSE,
  email_verify_token      VARCHAR(128),
  password_reset_token    VARCHAR(128),
  password_reset_expires  TIMESTAMPTZ,
  last_login_at           TIMESTAMPTZ,
  
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_password_or_supabase CHECK (password_hash IS NOT NULL OR supabase_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_supabase ON users(supabase_user_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- ── Usage Stats ───────────────────────────────────────────────
-- Track monthly and daily search usage per user
CREATE TABLE IF NOT EXISTS usage_stats (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Rolling counters (reset monthly)
  monthly_searches  INTEGER NOT NULL DEFAULT 0,
  daily_searches    INTEGER NOT NULL DEFAULT 0,
  total_searches    INTEGER NOT NULL DEFAULT 0,
  
  -- Period tracking
  month_year        VARCHAR(7) NOT NULL,   -- '2026-02' format
  last_search_at    TIMESTAMPTZ,
  last_reset_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reset_at          TIMESTAMPTZ,
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_stats(user_id);

-- ── Verification Logs ─────────────────────────────────────────
-- Full audit trail of every license check (scrubbed license numbers for privacy)
CREATE TABLE IF NOT EXISTS verification_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(id),
  organization_id   UUID REFERENCES organizations(id),
  
  -- What was checked
  state_code        CHAR(2) NOT NULL,
  license_number    VARCHAR(30) NOT NULL,   -- stored in full for audit
  license_type      VARCHAR(100),
  
  -- Result
  result_status     VARCHAR(20),            -- ACTIVE | EXPIRED | REVOKED | NOT_FOUND | ERROR
  holder_name       VARCHAR(255),
  expiration_date   DATE,
  is_armed          BOOLEAN DEFAULT FALSE,
  
  -- Meta
  search_method     VARCHAR(20) DEFAULT 'number', -- 'number' | 'name' | 'batch'
  from_cache        BOOLEAN DEFAULT FALSE,
  response_ms       INTEGER,
  ip_address        INET,
  user_agent        TEXT,
  api_key_id        UUID,                   -- if accessed via API key
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlog_user ON verification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_vlog_state ON verification_logs(state_code);
CREATE INDEX IF NOT EXISTS idx_vlog_created ON verification_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_vlog_license ON verification_logs(license_number, state_code);

-- ── Roster Assignments ────────────────────────────────────────
-- Saved guard rosters for Business/Enterprise plans
CREATE TABLE IF NOT EXISTS rosters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,    -- 'Main Roster', 'Stadium Guards', etc.
  description     TEXT,
  total_guards    INTEGER DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roster_guards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id       UUID NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  
  -- Guard identity
  guard_name      VARCHAR(255),
  state_code      CHAR(2) NOT NULL,
  license_number  VARCHAR(30) NOT NULL,
  license_type    VARCHAR(100),
  
  -- Last known status (from last verification)
  last_status     VARCHAR(20),
  last_expiry     DATE,
  is_armed        BOOLEAN DEFAULT FALSE,
  last_verified   TIMESTAMPTZ,
  
  -- Alert thresholds
  alert_days_before INTEGER DEFAULT 60,    -- alert when N days from expiry
  alert_enabled   BOOLEAN DEFAULT TRUE,
  
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(roster_id, state_code, license_number)
);

CREATE INDEX IF NOT EXISTS idx_roster_guards_roster ON roster_guards(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_guards_expiry ON roster_guards(last_expiry);

-- ── Alerts ────────────────────────────────────────────────────
-- Email/in-app alerts for expiring licenses
CREATE TABLE IF NOT EXISTS alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  roster_guard_id UUID REFERENCES roster_guards(id) ON DELETE CASCADE,
  
  alert_type      VARCHAR(30) NOT NULL,     -- 'expiring_30' | 'expiring_60' | 'expired' | 'revoked'
  state_code      CHAR(2),
  license_number  VARCHAR(30),
  guard_name      VARCHAR(255),
  expiration_date DATE,
  
  -- Delivery
  sent_at         TIMESTAMPTZ,
  email_sent_to   VARCHAR(255),
  acknowledged_at TIMESTAMPTZ,
  dismissed       BOOLEAN DEFAULT FALSE,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_unsent ON alerts(sent_at) WHERE sent_at IS NULL;

-- ── Event Packs ───────────────────────────────────────────────
-- One-time purchase tokens for event-specific verification
CREATE TABLE IF NOT EXISTS event_packs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id),
  stripe_session_id VARCHAR(200) UNIQUE NOT NULL,
  event_name        VARCHAR(255),
  token             VARCHAR(100) UNIQUE NOT NULL,  -- 'ep_...' token passed in API header
  guards_verified   INTEGER DEFAULT 0,
  max_guards        INTEGER DEFAULT 500,
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_packs_token ON event_packs(token);
CREATE INDEX IF NOT EXISTS idx_event_packs_user ON event_packs(user_id);

-- ── API Keys ──────────────────────────────────────────────────
-- For Enterprise tier API access
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  name            VARCHAR(100) NOT NULL,    -- e.g. 'Production', 'Staging'
  key_hash        TEXT NOT NULL,            -- sha256 hash of actual key
  key_prefix      VARCHAR(10) NOT NULL,     -- first 8 chars for display, e.g. 'gcc_live'
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,             -- null = never expires
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- ── Stripe Events Log ─────────────────────────────────────────
-- Idempotency: store processed webhook event IDs
CREATE TABLE IF NOT EXISTS stripe_events (
  stripe_event_id VARCHAR(100) PRIMARY KEY,
  event_type      VARCHAR(100),
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Helper Functions ──────────────────────────────────────────

-- Get current month usage for a user
CREATE OR REPLACE FUNCTION get_monthly_usage(p_user_id UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(monthly_searches, 0)
  FROM usage_stats
  WHERE user_id = p_user_id
    AND month_year = TO_CHAR(NOW(), 'YYYY-MM')
  LIMIT 1;
$$ LANGUAGE SQL;

-- Increment usage counter, creating record if needed
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID)
RETURNS VOID AS $$
  INSERT INTO usage_stats (user_id, month_year, monthly_searches, daily_searches, total_searches, last_search_at)
  VALUES (p_user_id, TO_CHAR(NOW(), 'YYYY-MM'), 1, 1, 1, NOW())
  ON CONFLICT (user_id, month_year) DO UPDATE
  SET 
    monthly_searches = usage_stats.monthly_searches + 1,
    daily_searches = CASE 
      WHEN DATE(usage_stats.last_search_at) < DATE(NOW()) THEN 1
      ELSE usage_stats.daily_searches + 1
    END,
    total_searches = usage_stats.total_searches + 1,
    last_search_at = NOW(),
    updated_at = NOW();
$$ LANGUAGE SQL;

-- ── Seed Data (Development) ───────────────────────────────────
-- INSERT INTO organizations (name, slug) VALUES ('Demo PPO Inc.', 'demo-ppo');
