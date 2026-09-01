import { db } from './index.ts';
import { sessions, messages, decisions, tasks, risks, meetingEvents, violations, expertFindings, consultationCalls, meetingInvites, institutionalMemoryEntries, users, organizations } from './schema.ts';
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

function compactMemoryText(value: unknown, limit = 1200): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function extractDurableFactsFromMessages(rows: any[], limit = 20): Array<{ title: string; content: string; subject?: string; memoryType: string; importance: number; metadata?: Record<string, unknown> }> {
  const output: Array<{ title: string; content: string; subject?: string; memoryType: string; importance: number; metadata?: Record<string, unknown> }> = [];
  const seen = new Set<string>();
  const add = (item: { title: string; content: string; subject?: string; memoryType: string; importance: number; metadata?: Record<string, unknown> }) => {
    const key = `${item.memoryType}|${item.title}|${item.content}`.toLowerCase();
    if (!item.title || !item.content || seen.has(key)) return;
    seen.add(key);
    output.push(item);
  };

  for (const row of rows) {
    const text = compactMemoryText(row?.text, 900);
    if (!text) continue;

    const roleMatch = text.match(/([\u0600-\u06FFA-Za-z][\u0600-\u06FFA-Za-z\s]{1,40})\s+(?:هو|هي|اسمه|اسمها)?\s*(?:مدير|رئيس|مسؤول|مسؤولة|مالك|صاحب|موظف|عضو|مشرف|مستشار|محاسب|مهندس)\s+([^،.؟!\n]{2,80})/iu);
    if (roleMatch) {
      const person = compactMemoryText(roleMatch[1], 80);
      add({
        title: `شخص/دور معروف: ${person}`,
        content: text,
        subject: person,
        memoryType: 'person_profile',
        importance: 5,
        metadata: { source: 'session_message', speakerName: row?.speakerName || null },
      });
    }

    const priceMatch = text.match(/(?:اشتريت|اشترينا|سعر|بكم|تكلفة|كلف)\s+([^،.؟!\n]{2,80})\s+(?:من|في|عند)\s+([^،.؟!\n]{2,80})\s+(?:ب|بسعر|وكان\s+سعره)\s*([0-9٠-٩,.]+)\s*([^،.؟!\n]*)/iu);
    if (priceMatch) {
      const item = compactMemoryText(priceMatch[1], 80);
      const place = compactMemoryText(priceMatch[2], 80);
      add({
        title: `معلومة سعر: ${item} لدى ${place}`,
        content: text,
        subject: `${item} - ${place}`,
        memoryType: 'price_fact',
        importance: 4,
        metadata: { source: 'session_message', speakerName: row?.speakerName || null },
      });
    }

    if (/(مهم|تذكر|لا تنسى|لازم تعرف|معلومة مهمة|للتاريخ)/iu.test(text)) {
      add({
        title: text.length > 90 ? `${text.slice(0, 87)}...` : text,
        content: text,
        subject: row?.speakerName || null,
        memoryType: 'important_fact',
        importance: 4,
        metadata: { source: 'session_message', speakerName: row?.speakerName || null },
      });
    }

    if (output.length >= limit) break;
  }
  return output.slice(0, limit);
}

async function archiveDurableSessionMemory(tx: any, sessionId: number) {
  const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session?.orgId) return;

  const [messageRows, decisionRows, taskRows, riskRows, violationRows, findingRows, eventRows] = await Promise.all([
    tx.select().from(messages).where(eq(messages.sessionId, sessionId)),
    tx.select().from(decisions).where(eq(decisions.sessionId, sessionId)),
    tx.select().from(tasks).where(eq(tasks.sessionId, sessionId)),
    tx.select().from(risks).where(eq(risks.meetingId, sessionId)),
    tx.select().from(violations).where(eq(violations.sessionId, sessionId)),
    tx.select().from(expertFindings).where(eq(expertFindings.sessionId, sessionId)),
    tx.select().from(meetingEvents).where(eq(meetingEvents.sessionId, sessionId)),
  ]);

  const values: any[] = [];
  const pushMemory = (entry: any) => {
    if (!entry?.title || !entry?.content) return;
    values.push({
      orgId: session.orgId,
      sourceSessionId: sessionId,
      sourceEntityType: entry.sourceEntityType || 'session_archive',
      sourceEntityId: entry.sourceEntityId ? String(entry.sourceEntityId) : null,
      memoryType: entry.memoryType || 'fact',
      title: compactMemoryText(entry.title, 280),
      content: compactMemoryText(entry.content, 1400),
      subject: entry.subject ? compactMemoryText(entry.subject, 160) : null,
      importance: entry.importance ?? 3,
      status: 'ACTIVE',
      metadata: {
        ...(entry.metadata || {}),
        archivedBecauseSessionDeleted: true,
        sourceSessionTitle: session.title,
        sourceSessionDeletedAt: new Date().toISOString(),
      },
    });
  };

  taskRows.forEach((task: any) => pushMemory({
    sourceEntityType: 'task',
    sourceEntityId: task.id,
    memoryType: 'task_history',
    title: `مهمة ${task.status || 'مسجلة'}: ${task.title}`,
    content: `المهمة: ${task.title}. المكلف: ${task.assignee || 'غير محدد'}. الحالة: ${task.status || 'PENDING'}. الوصف: ${task.description || 'لا يوجد'}.`,
    subject: task.assignee || task.title,
    importance: String(task.status || '').toUpperCase() === 'COMPLETED' ? 5 : 4,
  }));

  decisionRows.forEach((decision: any) => pushMemory({
    sourceEntityType: 'decision',
    sourceEntityId: decision.id,
    memoryType: String(decision.status || '').toUpperCase() === 'RECOMMENDED' ? 'recommendation_history' : 'decision_history',
    title: `${String(decision.status || '').toUpperCase() === 'RECOMMENDED' ? 'توصية' : 'قرار'}: ${decision.title}`,
    content: `${decision.title}. الحالة: ${decision.status || 'APPROVED'}. الوصف: ${decision.description || 'لا يوجد'}.`,
    subject: decision.title,
    importance: 4,
  }));

  riskRows.forEach((risk: any) => pushMemory({
    sourceEntityType: 'risk',
    sourceEntityId: risk.id,
    memoryType: 'risk_history',
    title: `خطر ${risk.status || 'مسجل'}: ${risk.title}`,
    content: `${risk.title}. المستوى: ${risk.riskLevel || risk.severity || 'غير مصنف'}. الحالة: ${risk.status || 'OPEN'}. الوصف: ${risk.description || 'لا يوجد'}.`,
    subject: risk.title,
    importance: 4,
  }));

  violationRows.forEach((violation: any) => pushMemory({
    sourceEntityType: 'violation',
    sourceEntityId: violation.id,
    memoryType: 'violation_history',
    title: `مخالفة/شبهة ${violation.status || 'مسجلة'}: ${violation.title}`,
    content: `${violation.title}. الحالة: ${violation.status || 'SUSPECTED'}. الشدة: ${violation.severity || 'MEDIUM'}. السند: ${violation.regulationRef || violation.regulationTitle || 'غير محدد'}. الدليل: ${violation.factualEvidence || 'غير محدد'}. الإجراء: ${violation.correctiveAction || 'غير محدد'}.`,
    subject: violation.title,
    importance: 5,
  }));

  findingRows.forEach((finding: any) => pushMemory({
    sourceEntityType: 'expert_finding',
    sourceEntityId: finding.id,
    memoryType: 'finding_history',
    title: `ملاحظة خبير: ${finding.title}`,
    content: `${finding.title}. النوع: ${finding.findingType || 'عام'}. الحالة: ${finding.status || 'OPEN'}. الشدة: ${finding.severity || 'INFO'}. الوصف: ${finding.description || 'لا يوجد'}. الدليل: ${finding.evidence || 'غير محدد'}.`,
    subject: finding.title,
    importance: 4,
  }));

  eventRows
    .filter((event: any) => /PARTICIPANT|MEMBER|حضور|مشارك|participant/i.test(String(event.eventType || event.title || '')))
    .slice(0, 20)
    .forEach((event: any) => pushMemory({
      sourceEntityType: 'meeting_event',
      sourceEntityId: event.id,
      memoryType: 'participant_memory',
      title: `حضور/مشارك: ${event.title}`,
      content: `${event.title}. التفاصيل: ${JSON.stringify(event.payload || {})}`,
      subject: event.title,
      importance: 3,
    }));

  extractDurableFactsFromMessages(messageRows).forEach((fact) => pushMemory({
    ...fact,
    sourceEntityType: 'message_fact',
  }));

  if (values.length > 0) {
    await tx.insert(institutionalMemoryEntries).values(values.slice(0, 120));
  }
}

export async function deleteSession(sessionId: number) {
  const sId = Number(sessionId);
  if (!sId || Number.isNaN(sId)) return;
  try {
    await db.transaction(async (tx) => {
      // Normal session deletion purges raw session memory, but first preserves
      // durable institutional facts/history so the expert can still remember
      // important people, completed tasks, decisions, prices, and closed cases.
      await archiveDurableSessionMemory(tx, sId);
      await tx.delete(meetingInvites).where(eq(meetingInvites.sessionId, sId));
      await tx.delete(expertFindings).where(eq(expertFindings.sessionId, sId));
      await tx.delete(violations).where(eq(violations.sessionId, sId));
      await tx.delete(consultationCalls).where(eq(consultationCalls.sessionId, sId));
      await tx.delete(meetingEvents).where(eq(meetingEvents.sessionId, sId));
      await tx.delete(messages).where(eq(messages.sessionId, sId));
      await tx.delete(decisions).where(eq(decisions.sessionId, sId));
      await tx.delete(tasks).where(eq(tasks.sessionId, sId));
      await tx.delete(risks).where(eq(risks.meetingId, sId));
      // Clear large narrative fields before deleting the row. This is redundant
      // for hard delete, but protects against future DB adapters that may switch
      // to soft-delete semantics.
      await tx.update(sessions).set({
        summary: null,
        minutes: null,
        agenda: null,
        participants: [],
        deletedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(sessions.id, sId));
      await tx.delete(sessions).where(eq(sessions.id, sId));
    });
  } catch (e) {
    console.error('Error in transactional deleteSession for session', sId, e);
    throw e;
  }
}
