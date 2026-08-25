-- Preserve the complete uploaded source alongside the extracted RAG text.
-- Keeping it in a separate table prevents normal knowledge-list queries from
-- loading large bytea values into memory.

CREATE TABLE IF NOT EXISTS knowledge_files (
  id            SERIAL PRIMARY KEY,
  knowledge_id  INTEGER NOT NULL UNIQUE REFERENCES knowledge(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  file_size     INTEGER NOT NULL CHECK (file_size >= 0),
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64),
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_files_knowledge_id
  ON knowledge_files(knowledge_id);
