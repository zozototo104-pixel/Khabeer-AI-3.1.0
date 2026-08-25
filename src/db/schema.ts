import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, jsonb, real, uniqueIndex, customType } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  nickname: text('nickname').default('رئيس الجلسة'),
  displayName: text('display_name').default('المستخدم'),
  roleTitle: text('role_title').default('رئيس الجلسة'),
  preferences: jsonb('preferences').default({
    preferredVoice: 'Zephyr',
    tone: 'warm_professional',
    directAddress: 'حضرتك',
    honorific: 'حضرتك'
  }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(), // User's Firebase UID
  name: text('name'),
  industry: text('industry'),
  structure: text('structure'),
  goals: text('goals'),
  strategy: text('strategy'),
  budget: text('budget'),
  policies: text('policies'),
  procedures: text('procedures'),
  projects: text('projects'),
  employees: jsonb('employees'), // Array of { name, role, department }
  kpis: text('kpis'),
  pastDecisions: text('past_decisions'),
  pastMeetings: text('past_meetings'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  orgId: integer('org_id').references(() => organizations.id),
  title: text('title').notNull().default('محادثة جديدة'),
  meetingType: text('meeting_type').default('GENERAL'),
  expertMode: text('expert_mode').default('CONSULTANT'),
  leadExpertId: text('lead_expert_id').default('governance_advisor'),
  selectedExperts: jsonb('selected_experts').default(['governance_advisor']),
  channel: text('channel').default('INTERNAL'),
  agenda: text('agenda'),
  participants: jsonb('participants').default([]),
  scheduledAt: timestamp('scheduled_at'),
  durationMinutes: integer('duration_minutes'),
  location: text('location'),
  meetingLink: text('meeting_link'),
  status: text('status').default('ACTIVE'),
  summary: text('summary'),
  minutes: jsonb('minutes'),
  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});


export const meetingInvites = pgTable('meeting_invites', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdByUserId: integer('created_by_user_id').references(() => users.id).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id).notNull(),
  text: text('text').notNull(),
  isUser: boolean('is_user').notNull(),
  speakerId: text('speaker_id'),
  speakerName: text('speaker_name'),
  speakerConfidence: real('speaker_confidence'),
  turnId: integer('turn_id'),
  expertId: text('expert_id'),
  source: text('source').default('TEXT'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const speakerProfiles = pgTable('speaker_profiles', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  speakerId: text('speaker_id').notNull(),
  name: text('name').notNull(),
  embeddings: jsonb('embeddings').notNull(),
  centroidEmbedding: jsonb('centroid_embedding').notNull(),
  sampleCount: integer('sample_count').notNull().default(1),
  confidence: real('confidence').notNull().default(0.9),
  isCandidate: boolean('is_candidate').notNull().default(false),
  status: text('status').notNull().default('VALID'),
  embeddingModel: text('embedding_model').notNull().default('legacy-unknown'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastSeenAt: timestamp('last_seen_at'),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  uniqueIndex('speaker_profiles_owner_speaker_uidx').on(table.ownerId, table.speakerId),
]);

export const decisions = pgTable('decisions', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  sessionId: integer('session_id').references(() => sessions.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('APPROVED'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  sessionId: integer('session_id').references(() => sessions.id),
  title: text('title').notNull(),
  description: text('description'),
  assignee: text('assignee'),
  status: text('status').default('PENDING'),
  deliverable: text('deliverable'),
  deliverableType: text('deliverable_type').default('PROCEDURE_MANUAL'),
  dueDate: timestamp('due_date'),
  priority: text('priority').default('HIGH'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const knowledge = pgTable('knowledge', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  title: text('title'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

/** The immutable source file. Extracted text stays in `knowledge` for RAG. */
export const knowledgeFiles = pgTable('knowledge_files', {
  id: serial('id').primaryKey(),
  knowledgeId: integer('knowledge_id').references(() => knowledge.id, { onDelete: 'cascade' }).notNull().unique(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  sha256: text('sha256').notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const meetingEvents = pgTable('meeting_events', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id),
  sessionId: integer('session_id').references(() => sessions.id).notNull(),
  eventType: text('event_type').notNull(),
  title: text('title').notNull(),
  payload: jsonb('payload').default({}),
  speakerId: text('speaker_id'),
  speakerName: text('speaker_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  messages: many(messages),
  events: many(meetingEvents),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}));

export const risks = pgTable('risks', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  meetingId: integer('meeting_id').references(() => sessions.id),
  title: text('title').notNull(),
  description: text('description'),
  severity: text('severity').default('HIGH'),
  category: text('category').default('FINANCIAL'),
  riskCode: text('risk_code'),
  probability: integer('probability'),
  impact: integer('impact'),
  inherentScore: real('inherent_score'),
  residualScore: real('residual_score'),
  riskLevel: text('risk_level'),
  evidence: text('evidence'),
  regulationRef: text('regulation_ref'),
  controls: jsonb('controls').default([]),
  owner: text('owner'),
  dueDate: timestamp('due_date'),
  detectedByExpertId: text('detected_by_expert_id'),
  status: text('status').default('OPEN'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const violations = pgTable('violations', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  sessionId: integer('session_id').references(() => sessions.id),
  violationCode: text('violation_code').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  domain: text('domain').default('COMPLIANCE'),
  regulationTitle: text('regulation_title'),
  regulationRef: text('regulation_ref'),
  articleNumber: text('article_number'),
  quotedProvision: text('quoted_provision'),
  factualEvidence: text('factual_evidence'),
  professionalAnalysis: text('professional_analysis'),
  severity: text('severity').default('MEDIUM'),
  confidence: real('confidence').default(0.5),
  status: text('status').default('SUSPECTED'),
  responsibleParty: text('responsible_party'),
  correctiveAction: text('corrective_action'),
  owner: text('owner'),
  dueDate: timestamp('due_date'),
  detectedByExpertId: text('detected_by_expert_id'),
  speakerId: text('speaker_id'),
  speakerName: text('speaker_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const expertFindings = pgTable('expert_findings', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  sessionId: integer('session_id').references(() => sessions.id),
  findingType: text('finding_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  evidence: text('evidence'),
  severity: text('severity').default('INFO'),
  confidence: real('confidence').default(0.5),
  status: text('status').default('OPEN'),
  expertId: text('expert_id'),
  speakerId: text('speaker_id'),
  speakerName: text('speaker_name'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const consultationCalls = pgTable('consultation_calls', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  sessionId: integer('session_id').references(() => sessions.id),
  provider: text('provider').notNull(),
  externalCallId: text('external_call_id'),
  direction: text('direction').default('INBOUND'),
  status: text('status').default('CREATED'),
  expertIds: jsonb('expert_ids').default([]),
  callerReferenceHash: text('caller_reference_hash'),
  consentRecorded: boolean('consent_recorded').default(false),
  metadata: jsonb('metadata').default({}),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P1-3 FIX: org_members table — enables inviting additional users to an org.
export const orgMembers = pgTable('org_members', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => organizations.id).notNull(),
  uid: text('uid').notNull(),
  role: text('role').default('member').notNull(),
  invitedByUid: text('invited_by_uid'),
  invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// P1-10 FIX: revoked_tokens — blocklist for direct-session tokens.
export const revokedTokens = pgTable('revoked_tokens', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  uid: text('uid').notNull(),
  reason: text('reason'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

// P2 FIX: audit_log — append-only trail of every create/update/delete.
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  uid: text('uid'),
  orgId: integer('org_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  summary: text('summary'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// P2 FIX: rate_limit_counters — simple per-uid action counts for rate limiting.
export const rateLimitCounters = pgTable('rate_limit_counters', {
  id: serial('id').primaryKey(),
  bucketKey: text('bucket_key').notNull().unique(),
  count: integer('count').default(1).notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
});
