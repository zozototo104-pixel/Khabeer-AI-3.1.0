CREATE TABLE IF NOT EXISTS institutional_memory_entries (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  source_session_id INTEGER,
  source_entity_type TEXT DEFAULT 'manual',
  source_entity_id TEXT,
  memory_type TEXT NOT NULL DEFAULT 'fact',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  subject TEXT,
  importance INTEGER DEFAULT 3,
  status TEXT DEFAULT 'ACTIVE',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_institutional_memory_org ON institutional_memory_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_institutional_memory_session ON institutional_memory_entries(source_session_id);
CREATE INDEX IF NOT EXISTS idx_institutional_memory_type ON institutional_memory_entries(memory_type);
CREATE INDEX IF NOT EXISTS idx_institutional_memory_status ON institutional_memory_entries(status);
