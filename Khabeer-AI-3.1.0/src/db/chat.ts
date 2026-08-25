import { db } from './index.ts';
import { sessions, messages, decisions, tasks, risks, meetingEvents, violations, expertFindings, consultationCalls, meetingInvites } from './schema.ts';
import { asc, eq, desc } from 'drizzle-orm';

export interface CreateSessionInput {
  title?: string;
  orgId?: number | null;
  meetingType?: string;
  expertMode?: string;
  leadExpertId?: string;
  selectedExperts?: string[];
  channel?: string;
  agenda?: string;
  participants?: unknown[];
  status?: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  scheduledAt?: Date | null;
  durationMinutes?: number | null;
  location?: string | null;
  meetingLink?: string | null;
}

export async function createSession(userId: number, input: string | CreateSessionInput = {}) {
  const values: CreateSessionInput = typeof input === 'string' ? { title: input } : input;
  // FIX (V4): guard against empty title — caller should already validate,
  // but double-check here so we never insert 'محادثة جديدة' silently.
  const title = values.title?.trim() || 'محادثة جديدة';
  const result = await db.insert(sessions).values({
    userId,
    title,
    orgId: values.orgId ?? null,
    meetingType: values.meetingType || 'GENERAL',
    expertMode: values.expertMode || 'CONSULTANT',
    leadExpertId: values.leadExpertId || 'governance_advisor',
    selectedExperts: values.selectedExperts || ['governance_advisor'],
    channel: values.channel || 'INTERNAL',
    agenda: values.agenda || null,
    participants: values.participants || [],
    scheduledAt: values.scheduledAt ?? null,
    durationMinutes: values.durationMinutes ?? null,
    location: values.location || null,
    meetingLink: values.meetingLink || null,
    status: values.status || 'ACTIVE',
  }).returning();
  // FIX (V4): verify the insert actually persisted by re-fetching the row.
  // In mock-DB mode, db.insert().returning() returns [{id:1, name:'Mock Data'}]
  // (not the row we just inserted) — so the caller can detect this and fail
  // loudly instead of sending garbage to the UI.
  const inserted = result[0];
  if (!inserted || !inserted.id) {
    throw new Error('SESSION_INSERT_RETURNED_EMPTY');
  }
  // Re-fetch to confirm persistence (catches silent transaction rollback)
  const verified = await db.select().from(sessions).where(eq(sessions.id, inserted.id)).limit(1);
  if (!verified[0]) {
    throw new Error('SESSION_NOT_FOUND_AFTER_INSERT');
  }
  return verified[0];
}

export async function updateSessionTitle(sessionId: number, title: string) {
  await db.update(sessions).set({ 
    title: title.trim(), 
    updatedAt: new Date() 
  }).where(eq(sessions.id, sessionId));
}

export interface MessageAttribution {
  speakerId?: string | null;
  speakerName?: string | null;
  speakerConfidence?: number | null;
  source?: 'VOICE' | 'TEXT' | 'SYSTEM';
  turnId?: number | null;
  expertId?: string | null;
}

export async function saveMessage(
  sessionId: number,
  text: string,
  isUser: boolean,
  attribution: MessageAttribution = {},
) {
  await db.insert(messages).values({
    sessionId,
    text,
    isUser,
    speakerId: attribution.speakerId || null,
    speakerName: attribution.speakerName || null,
    speakerConfidence: attribution.speakerConfidence ?? null,
    turnId: attribution.turnId ?? null,
    expertId: attribution.expertId || null,
    source: attribution.source || 'TEXT',
  });
}

export async function getSessions(userId: number) {
  return await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt));
}

export async function getMessages(sessionId: number) {
  return await db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(messages.createdAt);
}

export async function getMeetingTimeline(sessionId: number) {
  return await db.select().from(meetingEvents)
    .where(eq(meetingEvents.sessionId, sessionId))
    .orderBy(asc(meetingEvents.createdAt), asc(meetingEvents.id));
}

export interface MeetingContextUpdate {
  orgId?: number | null;
  title?: string;
  meetingType?: string;
  expertMode?: string;
  leadExpertId?: string;
  selectedExperts?: string[];
  channel?: string;
  agenda?: string;
  participants?: unknown[];
  status?: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  summary?: string;
  minutes?: unknown;
  endedAt?: Date | null;
  startedAt?: Date | null;
  scheduledAt?: Date | null;
  durationMinutes?: number | null;
  location?: string | null;
  meetingLink?: string | null;
}

export async function updateSessionMeetingContext(sessionId: number, update: MeetingContextUpdate) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) values[key] = value;
  }
  await db.update(sessions).set(values).where(eq(sessions.id, sessionId));
}

export async function appendMeetingEvent(params: {
  sessionId: number;
  orgId?: number | null;
  eventType: string;
  title: string;
  payload?: Record<string, unknown>;
  speakerId?: string | null;
  speakerName?: string | null;
}) {
  const inserted = await db.insert(meetingEvents).values({
    sessionId: params.sessionId,
    orgId: params.orgId || null,
    eventType: params.eventType.slice(0, 80),
    title: params.title.replace(/\s+/g, ' ').trim().slice(0, 300),
    payload: params.payload || {},
    speakerId: params.speakerId || null,
    speakerName: params.speakerName || null,
  }).returning();
  return inserted[0];
}

export async function deleteSession(sessionId: number) {
  const sId = Number(sessionId);
  if (!sId || Number.isNaN(sId)) return;
  try {
    await db.transaction(async (tx) => {
      // Meeting invite tokens must be removed in the same transaction as the session.
      await tx.delete(meetingInvites).where(eq(meetingInvites.sessionId, sId));
      await tx.delete(expertFindings).where(eq(expertFindings.sessionId, sId));
      await tx.delete(violations).where(eq(violations.sessionId, sId));
      await tx.delete(consultationCalls).where(eq(consultationCalls.sessionId, sId));
      await tx.delete(meetingEvents).where(eq(meetingEvents.sessionId, sId));
      await tx.delete(messages).where(eq(messages.sessionId, sId));
      await tx.delete(decisions).where(eq(decisions.sessionId, sId));
      await tx.delete(tasks).where(eq(tasks.sessionId, sId));
      await tx.delete(risks).where(eq(risks.meetingId, sId));
      await tx.delete(sessions).where(eq(sessions.id, sId));
    });
  } catch (e) {
    console.error('Error in transactional deleteSession for session', sId, e);
    throw e;
  }
}
