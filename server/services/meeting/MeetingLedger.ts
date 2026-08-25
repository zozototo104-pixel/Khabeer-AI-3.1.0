import { and, eq } from 'drizzle-orm';
import { db } from '../../../src/db/index.ts';
import { decisions, risks, tasks, meetingEvents } from '../../../src/db/schema.ts';
import { riskViolationService } from '../risk/RiskViolationService.ts';

export type MeetingItemType = 'DECISION' | 'RECOMMENDATION' | 'TASK' | 'RISK' | 'VIOLATION' | 'FINDING';

export interface MeetingLedgerItem {
  itemType: MeetingItemType;
  title: string;
  description?: string;
  evidence?: string;
  assignee?: string;
  dueDate?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category?: 'FINANCIAL' | 'LEGAL' | 'COMPLIANCE' | 'OPERATIONAL' | 'STRATEGIC' | 'REPUTATIONAL' | 'OTHER';
  deliverableType?: string;
  probability?: number;
  impact?: number;
  residualScore?: number;
  controls?: string[];
  owner?: string;
  regulationTitle?: string;
  regulationRef?: string;
  articleNumber?: string;
  quotedProvision?: string;
  factualEvidence?: string;
  professionalAnalysis?: string;
  correctiveAction?: string;
  responsibleParty?: string;
  confidence?: number;
  findingType?: string;
  expertId?: string;
  speakerId?: string | null;
  speakerName?: string | null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function parseDueDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class MeetingLedger {
  private async recordAuditEvent(
    item: MeetingLedgerItem,
    title: string,
    orgId: number,
    sessionId: number,
    recordId?: number,
  ): Promise<void> {
    await db.insert(meetingEvents).values({
      orgId,
      sessionId,
      eventType: item.itemType,
      title,
      speakerId: cleanText(item.speakerId, 160) || null,
      speakerName: cleanText(item.speakerName, 240) || null,
      payload: {
        recordId,
        description: cleanText(item.description, 4000),
        evidence: cleanText(item.evidence, 1600),
        assignee: cleanText(item.assignee, 240),
        dueDate: item.dueDate || null,
        severity: item.severity || null,
        category: item.category || null,
        deliverableType: cleanText(item.deliverableType, 80) || null,
      },
    });
  }

  async record(item: MeetingLedgerItem, orgId: number, sessionId: number): Promise<{ type: MeetingItemType; id?: number; duplicate: boolean }> {
    const title = cleanText(item.title, 240);
    if (!title) throw new Error('MEETING_ITEM_TITLE_REQUIRED');

    const descriptionParts = [cleanText(item.description, 4000)];
    const evidence = cleanText(item.evidence, 1600);
    if (evidence) descriptionParts.push(`الدليل من المداولة: ${evidence}`);
    const description = descriptionParts.filter(Boolean).join('\n');

    if (item.itemType === 'DECISION' || item.itemType === 'RECOMMENDATION') {
      const existing = await db.select({ id: decisions.id }).from(decisions).where(and(
        eq(decisions.orgId, orgId),
        eq(decisions.sessionId, sessionId),
        eq(decisions.title, title),
      )).limit(1);
      if (existing.length) return { type: item.itemType, id: existing[0].id, duplicate: true };

      const inserted = await db.insert(decisions).values({
        orgId,
        sessionId,
        title,
        description,
        status: item.itemType === 'DECISION' ? 'APPROVED' : 'RECOMMENDED',
      }).returning({ id: decisions.id });
      await this.recordAuditEvent(item, title, orgId, sessionId, inserted[0]?.id);
      return { type: item.itemType, id: inserted[0]?.id, duplicate: false };
    }

    if (item.itemType === 'TASK') {
      const existing = await db.select({ id: tasks.id }).from(tasks).where(and(
        eq(tasks.orgId, orgId),
        eq(tasks.sessionId, sessionId),
        eq(tasks.title, title),
      )).limit(1);
      if (existing.length) return { type: item.itemType, id: existing[0].id, duplicate: true };

      const inserted = await db.insert(tasks).values({
        orgId,
        sessionId,
        title,
        description,
        assignee: cleanText(item.assignee, 240) || 'غير محدد',
        status: 'PENDING',
        dueDate: parseDueDate(item.dueDate),
        priority: item.severity === 'CRITICAL' ? 'URGENT' : item.severity === 'LOW' ? 'LOW' : 'HIGH',
        deliverableType: cleanText(item.deliverableType, 80) || null,
      }).returning({ id: tasks.id });
      await this.recordAuditEvent(item, title, orgId, sessionId, inserted[0]?.id);
      return { type: item.itemType, id: inserted[0]?.id, duplicate: false };
    }

    if (item.itemType === 'VIOLATION') {
      return riskViolationService.recordViolation(item, orgId, sessionId);
    }

    if (item.itemType === 'FINDING') {
      return riskViolationService.recordFinding(item, orgId, sessionId) as Promise<{ type: MeetingItemType; id?: number; duplicate: boolean }>;
    }

    if (item.itemType === 'RISK') {
      return riskViolationService.recordRisk(item, orgId, sessionId) as Promise<{ type: MeetingItemType; id?: number; duplicate: boolean }>;
    }

    throw new Error('UNSUPPORTED_MEETING_ITEM_TYPE');
  }
}

export const meetingLedger = new MeetingLedger();
