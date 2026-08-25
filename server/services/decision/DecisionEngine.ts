import { adminDb } from '../../../src/lib/firebase-admin.ts';

/**
 * DecisionEngine
 * 
 * Provides analytical models and simulation parameters for the AI.
 * Supplies frameworks (SWOT, Risk Matrices, Cost-Benefit Analysis) that the AI Provider can use to structure its reasoning.
 */
export class DecisionEngine {
  constructor() {}

  getDecisionFramework(meetingType: string): string {
    switch (meetingType) {
      case 'STRATEGIC':
        return "استخدم تحليل SWOT (نقاط القوة، الضعف، الفرص، التهديدات) واقترح 3 بدائل واضحة.";
      case 'FINANCIAL':
        return "ركز على العائد على الاستثمار (ROI)، تحليل التكلفة والفائدة، وتأثير التدفق النقدي.";
      case 'CRISIS':
        return "ركز على التخفيف الفوري، التواصل مع أصحاب المصلحة، والتخطيط لأسوأ السيناريوهات.";
      default:
        return "قم بتقييم الإيجابيات، السلبيات، والخطوات القابلة للتنفيذ فوراً.";
    }
  }

  async fetchSimilarDecisions(organizationId: string, keyword: string): Promise<any[]> {
    if (!organizationId) return [];
    
    // In a real system, we'd use vector search on the decisions collection.
    // MVP: fetch recent decisions and filter in memory as a mock simulation.
    try {
      const snapshot = await adminDb.collection('decisions')
        .where('orgId', '==', organizationId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
        
      const results = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((d: any) => d.title.includes(keyword) || (d.description && d.description.includes(keyword)));
        
      return results;
    } catch (e) {
      console.error("Error fetching similar decisions:", e);
      return [];
    }
  }
}

