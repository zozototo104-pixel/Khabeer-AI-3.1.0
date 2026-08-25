BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS org_id integer REFERENCES organizations(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meeting_type text DEFAULT 'GENERAL';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expert_mode text DEFAULT 'CONSULTANT';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agenda text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participants jsonb DEFAULT '[]'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS minutes jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS started_at timestamp DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_at timestamp;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS turn_id integer;
ALTER TABLE speaker_profiles ADD COLUMN IF NOT EXISTS embedding_model text NOT NULL DEFAULT 'legacy-unknown';
ALTER TABLE users ALTER COLUMN nickname SET DEFAULT 'رئيس الجلسة';
ALTER TABLE users ALTER COLUMN display_name SET DEFAULT 'المستخدم';
ALTER TABLE users ALTER COLUMN role_title SET DEFAULT 'رئيس الجلسة';

CREATE TABLE IF NOT EXISTS meeting_events (
  id serial PRIMARY KEY,
  org_id integer REFERENCES organizations(id),
  session_id integer NOT NULL REFERENCES sessions(id),
  event_type text NOT NULL,
  title text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  speaker_id text,
  speaker_name text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_org_status_idx ON sessions(org_id, status);
CREATE INDEX IF NOT EXISTS meeting_events_session_created_idx ON meeting_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS meeting_events_org_type_idx ON meeting_events(org_id, event_type);

COMMIT;
