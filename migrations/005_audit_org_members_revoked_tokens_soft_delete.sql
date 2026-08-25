-- Migration 005: P1/P2 fixes — org_members, audit_log, revoked_tokens
-- Adds the missing infrastructure required for:
--   * P1-2: GDPR right-to-erasure (account deletion audit trail)
--   * P1-3: multi-user org collaboration (org_members table)
--   * P1-10: token revocation (revoked_tokens table)
--   * P2: audit_log table for tracking all create/update/delete operations

-- ---------------------------------------------------------------------------
-- P1-3: org_members table — enables inviting additional users to an org
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_members (
  id              SERIAL PRIMARY KEY,
  org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uid             TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  invited_by_uid  TEXT,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  UNIQUE (org_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_org_members_uid ON org_members(uid);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);

-- ---------------------------------------------------------------------------
-- P1-10: revoked_tokens table — blocklist for direct-session tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id          SERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  uid         TEXT NOT NULL,
  reason      TEXT,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ  -- when the original token would have expired
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_hash ON revoked_tokens(token_hash);

-- ---------------------------------------------------------------------------
-- P2: audit_log table — append-only trail of every create/update/delete
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL PRIMARY KEY,
  uid          TEXT,
  org_id       INTEGER,
  action       TEXT NOT NULL,  -- 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'PERMISSION'
  entity_type  TEXT NOT NULL,  -- 'session' | 'knowledge' | 'speaker' | 'organization' | 'user' | 'decision' | 'risk' | 'violation' | ...
  entity_id    TEXT,
  summary      TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_uid ON audit_log(uid);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- P1-4: add updated_at + soft-delete columns to knowledge table
-- (we don't drop rows on delete; we mark them deleted_at so the audit
-- trail can still see what was removed)
-- ---------------------------------------------------------------------------
ALTER TABLE knowledge
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- P1-2: add deleted_at to users table (right-to-erasure pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- P1-5: add updated_at + soft-delete to decisions, risks, expert_findings,
-- violations so they can be edited/corrected without losing audit trail.
-- ---------------------------------------------------------------------------
ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE expert_findings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE speaker_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- P2: rate-limit helper table (optional — simple per-uid action counts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  id              SERIAL PRIMARY KEY,
  bucket_key      TEXT NOT NULL,        -- e.g. 'direct_session:uid_123' or 'auth_fail:ip_1.2.3.4'
  count           INTEGER NOT NULL DEFAULT 1,
  window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket_key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket ON rate_limit_counters(bucket_key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_counters(window_start);
