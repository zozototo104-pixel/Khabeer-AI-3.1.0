BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  uid text NOT NULL UNIQUE,
  email text NOT NULL,
  nickname text DEFAULT 'رئيس الجلسة',
  display_name text DEFAULT 'المستخدم',
  role_title text DEFAULT 'رئيس الجلسة',
  preferences jsonb DEFAULT '{"preferredVoice":"Zephyr","tone":"warm_professional","directAddress":"حضرتك","honorific":"حضرتك"}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  name text,
  industry text,
  structure text,
  goals text,
  strategy text,
  budget text,
  policies text,
  procedures text,
  projects text,
  employees jsonb,
  kpis text,
  past_decisions text,
  past_meetings text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  org_id integer REFERENCES organizations(id),
  title text NOT NULL DEFAULT 'محادثة جديدة',
  meeting_type text DEFAULT 'GENERAL',
  expert_mode text DEFAULT 'CONSULTANT',
  lead_expert_id text DEFAULT 'governance_advisor',
  selected_experts jsonb DEFAULT '["governance_advisor"]'::jsonb,
  channel text DEFAULT 'INTERNAL',
  agenda text,
  participants jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'ACTIVE',
  summary text,
  minutes jsonb,
  started_at timestamp DEFAULT now(),
  ended_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES sessions(id),
  text text NOT NULL,
  is_user boolean NOT NULL,
  speaker_id text,
  speaker_name text,
  speaker_confidence real,
  turn_id integer,
  expert_id text,
  source text DEFAULT 'TEXT',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  session_id integer REFERENCES sessions(id),
  title text NOT NULL,
  description text,
  status text DEFAULT 'APPROVED',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  session_id integer REFERENCES sessions(id),
  title text NOT NULL,
  description text,
  assignee text,
  status text DEFAULT 'PENDING',
  deliverable text,
  deliverable_type text DEFAULT 'PROCEDURE_MANUAL',
  due_date timestamp,
  priority text DEFAULT 'HIGH',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  title text,
  content text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risks (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES organizations(id),
  meeting_id integer REFERENCES sessions(id),
  title text NOT NULL,
  description text,
  severity text DEFAULT 'HIGH',
  category text DEFAULT 'FINANCIAL',
  risk_code text,
  probability integer,
  impact integer,
  inherent_score real,
  residual_score real,
  risk_level text,
  evidence text,
  regulation_ref text,
  controls jsonb DEFAULT '[]'::jsonb,
  owner text,
  due_date timestamp,
  detected_by_expert_id text,
  status text DEFAULT 'OPEN',
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organizations_owner_idx ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS sessions_user_created_idx ON sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS decisions_org_created_idx ON decisions(org_id, created_at);
CREATE INDEX IF NOT EXISTS tasks_org_status_idx ON tasks(org_id, status);
CREATE INDEX IF NOT EXISTS knowledge_org_created_idx ON knowledge(org_id, created_at);

COMMIT;
