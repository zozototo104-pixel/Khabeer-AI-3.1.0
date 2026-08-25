BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lead_expert_id text DEFAULT 'governance_advisor';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS selected_experts jsonb DEFAULT '["governance_advisor"]'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS channel text DEFAULT 'INTERNAL';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS expert_id text;

ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_code text;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS probability integer;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS impact integer;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS inherent_score real;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS residual_score real;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_level text;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS evidence text;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS regulation_ref text;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS controls jsonb DEFAULT '[]'::jsonb;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS due_date timestamp;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS detected_by_expert_id text;

CREATE TABLE IF NOT EXISTS violations (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  session_id integer REFERENCES sessions(id),
  violation_code text NOT NULL,
  title text NOT NULL,
  description text,
  domain text DEFAULT 'COMPLIANCE',
  regulation_title text,
  regulation_ref text,
  article_number text,
  quoted_provision text,
  factual_evidence text,
  professional_analysis text,
  severity text DEFAULT 'MEDIUM',
  confidence real DEFAULT 0.5,
  status text DEFAULT 'SUSPECTED',
  responsible_party text,
  corrective_action text,
  owner text,
  due_date timestamp,
  detected_by_expert_id text,
  speaker_id text,
  speaker_name text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expert_findings (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  session_id integer REFERENCES sessions(id),
  finding_type text NOT NULL,
  title text NOT NULL,
  description text,
  evidence text,
  severity text DEFAULT 'INFO',
  confidence real DEFAULT 0.5,
  status text DEFAULT 'OPEN',
  expert_id text,
  speaker_id text,
  speaker_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consultation_calls (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  session_id integer REFERENCES sessions(id),
  provider text NOT NULL,
  external_call_id text,
  direction text DEFAULT 'INBOUND',
  status text DEFAULT 'CREATED',
  expert_ids jsonb DEFAULT '[]'::jsonb,
  caller_reference_hash text,
  consent_recorded boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamp,
  ended_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS violations_org_code_uidx ON violations(org_id, violation_code);
CREATE INDEX IF NOT EXISTS violations_session_status_idx ON violations(session_id, status);
CREATE INDEX IF NOT EXISTS risks_org_level_idx ON risks(org_id, risk_level);
CREATE INDEX IF NOT EXISTS expert_findings_session_type_idx ON expert_findings(session_id, finding_type);
CREATE INDEX IF NOT EXISTS consultation_calls_org_created_idx ON consultation_calls(org_id, created_at);

COMMIT;
