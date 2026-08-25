BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scheduled_at timestamp;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meeting_link text;

CREATE TABLE IF NOT EXISTS meeting_invites (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by_user_id integer NOT NULL REFERENCES users(id),
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_invites_session_idx ON meeting_invites(session_id);
CREATE INDEX IF NOT EXISTS meeting_invites_expires_idx ON meeting_invites(expires_at);

COMMIT;
