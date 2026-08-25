BEGIN;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS speaker_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS speaker_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS speaker_confidence real;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source text DEFAULT 'TEXT';

CREATE TABLE IF NOT EXISTS speaker_profiles (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  speaker_id text NOT NULL,
  name text NOT NULL,
  embeddings jsonb NOT NULL,
  centroid_embedding jsonb NOT NULL,
  sample_count integer NOT NULL DEFAULT 1,
  confidence real NOT NULL DEFAULT 0.9,
  is_candidate boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'VALID',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  last_seen_at timestamp,
  CONSTRAINT speaker_profiles_owner_speaker_unique UNIQUE (owner_id, speaker_id)
);

CREATE INDEX IF NOT EXISTS speaker_profiles_owner_idx ON speaker_profiles(owner_id);
CREATE INDEX IF NOT EXISTS messages_session_created_idx ON messages(session_id, created_at);

COMMIT;
