import { db } from '../../../src/db/index.ts';
import { decisions, tasks, organizations, users } from '../../../src/db/schema.ts';
import { eq, desc, not, and } from 'drizzle-orm';
import { getUserByUid } from '../../../src/db/users.ts';

export class MemoryEngine {
  constructor() {}

  async getUserProfile(uid: string): Promise<any> {
    try {
      return await getUserByUid(uid);
    } catch (e) {
      console.error("Error fetching user profile:", e);
      return null;
    }
  }

  async getUserProfilePayload(uid: string): Promise<string> {
    try {
      const user = await this.getUserProfile(uid);
      const nickname = user?.nickname || 'رئيس الجلسة';
      const displayName = user?.displayName || 'المستخدم';
      const roleTitle = user?.roleTitle || 'رئيس الجلسة';
      const prefs = user?.preferences || {};

      let payload = `=== بطاقة حساب رئيس الجلسة / المستخدم الأساسي ===\n`;
      payload += `• معرف المستخدم: ${uid}\n`;
      payload += `• كنية رئيس الجلسة (للمخاطبة عند تحدثه هو فقط): ${nickname}\n`;
      payload += `• الاسم المعروض: ${displayName}\n`;
      payload += `• الدور: ${roleTitle}\n`;
      payload += `• التفضيلات: نبرة ${prefs.tone || 'مهنية دافئة وتفاعلية'}\n`;
      payload += `\n⚠️ قاعدة التمييز الصوتي وتعدد المشاركين:\n`;
      payload += `• لا تفترض أبداً أن كل متحدث في الجلسة هو ${nickname}.\n`;
      payload += `• إذا تحدثت أخت أو عضوة نسائية أو أي مشارك آخر، خاطب كلاً منهم بهويته وصيغته المناسبة (أختي الفاضلة / الأستاذة / بالاسم المذكور).\n`;
      payload += `• يُمنع منعاً باتاً مناداة أي متحدثة نسائية بـ "${nickname}".\n`;

      return payload;
    } catch (e) {
      console.error("Error building user profile payload:", e);
      return `=== ملف تعريف المستخدم الدائم ===\n• الاسم: غير محدد\n• توجيه: لا تفترض اسماً؛ استخدم "حضرتك" حتى يعرّف المستخدم نفسه.`;
    }
  }

  async getRecentDecisions(organizationId: number, limitCount: number = 5): Promise<any[]> {
    return await db.select()
      .from(decisions)
      .where(eq(decisions.orgId, organizationId))
      .orderBy(desc(decisions.createdAt))
      .limit(limitCount);
  }

  async getPendingTasks(organizationId: number): Promise<any[]> {
    return await db.select()
      .from(tasks)
      .where(and(eq(tasks.orgId, organizationId), not(eq(tasks.status, 'COMPLETED'))));
  }

  async getOrganization(organizationId: number): Promise<any> {
    const results = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    return results.length > 0 ? results[0] : null;
  }
  
  async getOrganizationByOwner(ownerId: string): Promise<any> {
    const results = await db.select().from(organizations)
      .where(eq(organizations.ownerId, ownerId))
      .orderBy(desc(organizations.updatedAt)) // Get the most recently created one
      .limit(1);
    
    if (results.length > 0) {
      return results[0];
    }

    try {
      const newOrg = await db.insert(organizations).values({
        ownerId: ownerId,
        name: 'مؤسستي',
      }).returning();
      return newOrg[0];
    } catch (e) {
      console.error("Auto-create org error:", e);
      return null;
    }
  }

  async getContextualMemoryPayload(organizationId: number): Promise<string> {
    if (!organizationId) {
      return "لا توجد معلومات عن المؤسسة حالياً. أنت مستشار عام.";
    }

    try {
      const org = await this.getOrganization(organizationId);
      
      let payload = `=== بطاقة تعريف المؤسسة ===\n`;
      payload += `اسم المؤسسة: ${org?.name || 'غير محدد'}\n`;
      if (org?.industry) payload += `النشاط ومجال العمل: ${org.industry}\n`;
      if (org?.structure) payload += `الهيكل التنظيمي: ${org.structure}\n`;
      if (org?.goals) payload += `الأهداف الاستراتيجية: ${org.goals}\n`;
      if (org?.strategy) payload += `الاستراتيجية المتبعة: ${org.strategy}\n`;
      if (org?.kpis) payload += `مؤشرات الأداء (KPIs): ${org.kpis}\n`;
      if (org?.budget) payload += `الميزانية والموارد: ${org.budget}\n`;
      if (org?.projects) payload += `المشاريع الحالية: ${org.projects}\n`;
      if (org?.policies) payload += `السياسات الحاكمة: ${org.policies}\n`;
      if (org?.procedures) payload += `الإجراءات: ${org.procedures}\n`;
      if (org?.employees) payload += `الموظفون والقيادات: ${JSON.stringify(org.employees)}\n`;
      
      if (org?.pastDecisions) payload += `\n=== قرارات سابقة مسجلة يدوياً ===\n${org.pastDecisions}\n`;
      if (org?.pastMeetings) payload += `\n=== ملخص اجتماعات سابقة يدوية ===\n${org.pastMeetings}\n`;

      // Fetch dynamic decisions and tasks from DB as well
      const recentDecisions = await this.getRecentDecisions(organizationId);
      const pendingTasks = await this.getPendingTasks(organizationId);
      
      payload += `\n=== القرارات المتخذة مؤخراً عبر النظام ===\n`;
      if (recentDecisions.length === 0) {
        payload += `- لا توجد قرارات آلية مسجلة.\n`;
      } else {
        recentDecisions.forEach(d => {
          payload += `- ${d.title} (الحالة: ${d.status})\n  الوصف: ${d.description || ''}\n`;
        });
      }

      payload += `\n=== المهام المعلقة في النظام ===\n`;
      if (pendingTasks.length === 0) {
        payload += `- لا توجد مهام معلقة.\n`;
      } else {
        pendingTasks.forEach(t => {
          payload += `- ${t.title} (المسؤول: ${t.assignee || 'غير محدد'})\n`;
        });
      }

      return payload;
    } catch (e) {
      console.error("Error fetching contextual memory:", e);
      return "حدث خطأ أثناء جلب ذاكرة المؤسسة. تصرف كمستشار إداري عام.";
    }
  }

  async buildSystemPromptContext(uid: string, organizationId?: number): Promise<string> {
    try {
      const userProfileText = await this.getUserProfilePayload(uid);
      let memoryText = "";
      if (organizationId) {
        memoryText = await this.getContextualMemoryPayload(organizationId);
      }
      return `${userProfileText}\n\n${memoryText}`.trim();
    } catch (e) {
      console.error("Error building system prompt context:", e);
      return "";
    }
  }
}
