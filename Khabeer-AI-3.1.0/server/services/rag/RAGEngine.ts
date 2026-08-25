import { db } from '../../../src/db/index.ts';
import { knowledge } from '../../../src/db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { assessDocumentTextQuality } from '../knowledge/DocumentTextQuality.ts';

export interface KnowledgeDocument {
  id: number;
  orgId: number;
  title: string;
  content: string;
  createdAt: Date | string;
}

// P0-5 FIX: lightweight in-memory semantic search layer.
// We do NOT install pgvector / Chroma / Pinecone because that would require
// a database migration and a new dependency. Instead, when GEMINI_API_KEY
// is available we ask Gemini for a 768-dim embedding of the user's query
// AND a 768-dim embedding of each document's first ~3000 chars (chunked),
// cache those document embeddings per (orgId, docId) so we only pay the
// cost once per document, and compute cosine similarity in JS at query
// time. When GEMINI_API_KEY is missing or the API call fails, we silently
// fall back to the existing keyword/regex pipeline — no regression.
//
// The in-memory cache is process-local. Multi-instance deployments should
// switch to a shared vector store (Pinecone, Weaviate, pgvector) but the
// current single-instance Render deployment is fine.

interface CachedDocEmbedding {
  docId: number;
  orgId: number;
  embedding: number[];
  ts: number;
}
const docEmbeddingCache = new Map<number, CachedDocEmbedding>();
const DOC_EMBEDDING_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_DOC_CHARS_FOR_EMBEDDING = 3000;
const EMBED_MODEL = 'text-embedding-004';

function cosineSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

async function embedText(text: string): Promise<number[] | null> {
  const apiKey = (process.env as any).GEMINI_API_KEY;
  if (!apiKey || !text) return null;
  try {
    const truncated = text.slice(0, MAX_DOC_CHARS_FOR_EMBEDDING);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: truncated }] } }),
      },
    );
    if (!resp.ok) {
      console.warn(`[RAG] embedText HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return null;
    }
    const data: any = await resp.json();
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) return null;
    return values;
  } catch (e: any) {
    console.warn('[RAG] embedText failed:', e?.message || String(e));
    return null;
  }
}

async function embedDocument(doc: KnowledgeDocument): Promise<number[] | null> {
  const cached = docEmbeddingCache.get(doc.id);
  if (cached && Date.now() - cached.ts < DOC_EMBEDDING_TTL_MS) return cached.embedding;
  const text = `${doc.title || ''}\n\n${(doc.content || '').slice(0, MAX_DOC_CHARS_FOR_EMBEDDING)}`;
  const embedding = await embedText(text);
  if (embedding) {
    docEmbeddingCache.set(doc.id, { docId: doc.id, orgId: doc.orgId, embedding, ts: Date.now() });
  }
  return embedding;
}

// Convert Eastern Arabic digits (٠١٢٣٤٥٦٧٨٩) to standard Western digits (0-9)
function normalizeArabicDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
}

// Convert common Arabic spelled-out numbers and ordinals to integer strings
function parseArabicSpelledNumber(text: string): string | null {
  if (!text) return null;
  const clean = text.replace(/[^\u0621-\u064A\s]/g, '').trim();

  // Unit numbers / Ordinals
  const units: Record<string, number> = {
    'الاول': 1, 'الاولى': 1, 'واحد': 1, 'واحدة': 1, 'حادي': 1, 'حادية': 1,
    'الثاني': 2, 'الثانية': 2, 'اثنين': 2, 'اثنان': 2, 'اثنتين': 2, 'اثنتان': 2,
    'الثالث': 3, 'الثالثة': 3, 'ثلاث': 3, 'ثلاثة': 3,
    'الرابع': 4, 'الرابعة': 4, 'اربع': 4, 'اربعة': 4, 'أربع': 4, 'أربعة': 4,
    'الخامس': 5, 'الخامسة': 5, 'خمس': 5, 'خمسة': 5,
    'السادس': 6, 'السادسة': 6, 'ست': 6, 'ستة': 6,
    'السابع': 7, 'السابعة': 7, 'سبع': 7, 'سبعة': 7,
    'الثامن': 8, 'الثامنة': 8, 'ثمان': 8, 'ثمانية': 8,
    'التاسع': 9, 'التاسعة': 9, 'تسع': 9, 'تسعة': 9,
    'العاشر': 10, 'العاشرة': 10, 'عشر': 10, 'عشرة': 10
  };

  // Tens
  const tens: Record<string, number> = {
    'العشرون': 20, 'العشرين': 20, 'عشرون': 20, 'عشرين': 20,
    'الثلاثون': 30, 'الثلاثين': 30, 'ثلاثون': 30, 'ثلاثين': 30,
    'الاربعون': 40, 'الاربعين': 40, 'الأربعون': 40, 'الأربعين': 40, 'اربعون': 40, 'اربعين': 40,
    'الخمسون': 50, 'الخمسين': 50, 'خمسون': 50, 'خمسين': 50,
    'الستون': 60, 'الستين': 60, 'ستون': 60, 'ستين': 60,
    'السبعون': 70, 'السبعين': 70, 'سبعون': 70, 'سبعين': 70,
    'الثمانون': 80, 'الثمانين': 80, 'ثمانون': 80, 'ثمانين': 80,
    'التسعون': 90, 'التسعين': 90, 'تسعون': 90, 'تسعين': 90,
    'المائة': 100, 'المئة': 100, 'مائة': 100, 'مئة': 100
  };

  // Check compound numbers like "التاسعة والخمسون", "تسعة وخمسين", "الثالثة والأربعون"
  for (const [tWord, tVal] of Object.entries(tens)) {
    for (const [uWord, uVal] of Object.entries(units)) {
      if (
        clean.includes(`${uWord} و${tWord}`) ||
        clean.includes(`${uWord} و ${tWord}`) ||
        clean.includes(`${uWord} وال${tWord.replace(/^ال/, '')}`)
      ) {
        return (tVal + uVal).toString();
      }
    }
  }

  // Check teens like "الحادي عشر", "الثاني عشر", "الخامس عشر"
  for (const [uWord, uVal] of Object.entries(units)) {
    if (clean.includes(`${uWord} عشر`) || clean.includes(`${uWord} العشر`)) {
      return (10 + uVal).toString();
    }
  }

  // Check standalone tens
  for (const [tWord, tVal] of Object.entries(tens)) {
    if (clean.includes(tWord)) {
      return tVal.toString();
    }
  }

  // Check standalone units
  for (const [uWord, uVal] of Object.entries(units)) {
    if (clean.includes(uWord)) {
      return uVal.toString();
    }
  }

  return null;
}

export class RAGEngine {
  private liveContextCache = new Map<number, { expiresAt: number; value: string }>();

  constructor() {}

  invalidateOrganization(organizationId: number): void {
    this.liveContextCache.delete(organizationId);
  }

  async getDocuments(organizationId: number): Promise<KnowledgeDocument[]> {
    try {
      let results: any[] = [];
      if (organizationId) {
        // P1-4 FIX: raise the limit from 50 → 200 so older regulation documents
        // remain reachable by RAG retrieval. The original 50-row cap silently
        // hid legacy documents from the context injected into the expert prompt.
        results = await db.select()
          .from(knowledge)
          .where(eq(knowledge.orgId, organizationId))
          .orderBy(desc(knowledge.createdAt))
          .limit(200);
      }
      // Never fall back to another tenant's documents. An empty organization
      // knowledge base must remain empty. Also quarantine documents whose
      // extracted text is clearly corrupted so the expert never cites mojibake.
      const safeResults = (results as KnowledgeDocument[]).filter((doc) => {
        const quality = assessDocumentTextQuality(doc.content || '');
        if (quality.usable) return true;
        console.warn('[RAG] Ignoring unusable knowledge document:', {
          id: doc.id,
          title: doc.title,
          reason: quality.reason,
        });
        return false;
      });
      return safeResults;
    } catch (e) {
      console.error("Error fetching knowledge docs:", e);
      return [];
    }
  }

  /**
   * Fast targeted lookup for specific articles, bylaws, annexes/attachments, tables, numbers, or legal terms
   * (e.g. الملحق 4, الملحق رقم 4, ملحق الوقف والاعتماد, ملحق العقوبات, المادة 59, المادة ٥٩, المادة التاسعة والخمسون, المادة 43, جدول المخالفات)
   */
  async findSpecificArticleOrClause(
    query: string,
    organizationId: number,
    prefetchedDocuments?: KnowledgeDocument[],
  ): Promise<string[]> {
    const docs = prefetchedDocuments || await this.getDocuments(organizationId);
    if (!docs.length || !query) return [];

    const matches: string[] = [];
    const cleanQuery = query.trim();
    const normalizedDigitsQuery = normalizeArabicDigits(cleanQuery);

    // Check if query is looking for an Annex / Attachment / Schedule / Table (ملحق، جدول، استمارة، نموذج، وقف، اعتماد، عقوبات)
    const isAnnexOrTableQuery = /(?:ملحق|الملحق|جدول|الجدول|نموذج|النموذج|استمارة|الاستمارة|مرفق|المرفق|بيان|البيان|فهرس|وقف|الوقف|اعتماد|الاعتماد|عقوبات|المخالفات|الجزاءات|النظام المالي)/i.test(query);

    // 1. Detect target number from digits (e.g. 4, 59, 43) or spelled out words (الرابع، التاسعة والخمسون)
    let targetNum: string | null = null;
    const digitMatch = normalizedDigitsQuery.match(/(?:المادة|مادة|البند|فصل|م\s*|رقم|\#|ملحق|الملحق|جدول|الجدول|استمارة|نموذج)\s*(\d+)/i);
    if (digitMatch && digitMatch[1]) {
      targetNum = digitMatch[1];
    } else {
      targetNum = parseArabicSpelledNumber(cleanQuery);
    }

    for (const doc of docs) {
      const content = doc.content || '';
      const docTitle = doc.title || 'لائحة تنظيمية';
      const lines = content.split('\n');

      // --- SECTION A: Annexes / Tables / Attachments / Schedules Lookup ---
      if (isAnnexOrTableQuery || (targetNum && /ملحق|الملحق|جدول|الجدول/i.test(cleanQuery))) {
        let extractedAnnex: string | null = null;

        // 1. Targeted annex by number (e.g. ملحق 1, ملحق 2, ملحق 3, ملحق 4)
        if (targetNum) {
          let capturingAnnex = false;
          const capturedLines: string[] = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const cleanLine = line.trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());

            // Skip table of contents lines with dots (e.g. "...... 104")
            if (cleanLine.includes(".....") || cleanLine.includes("........")) continue;

            const isAnnexHeader = /(?:^#+\s*ملحق|^#+\s*الملحق)\s*(?:رقم)?\s*[\(\\[]?\s*(\d+)/i.exec(cleanLine);
            if (isAnnexHeader) {
              const num = isAnnexHeader[1];
              if (num === targetNum.toString()) {
                capturingAnnex = true;
                capturedLines.push(line);
              } else if (capturingAnnex) {
                break; // Hit next annex
              }
            } else if (capturingAnnex) {
              if (/^#\s+ملحق|^#\s+الملحق/i.test(cleanLine)) {
                break;
              }
              capturedLines.push(line);
            }
          }

          if (capturedLines.length > 0) {
            extractedAnnex = capturedLines.join('\n').trim();
            matches.push(`📋 [📌 نص تفصيلي كامل ومباشر للملحق (${targetNum}) من ${docTitle}]:\n${extractedAnnex}`);
          }
        }

        // 2. Keyword-based Annex Search (e.g. "الوقف والاعتماد", "جدول المخالفات والجزاءات", "النظام المالي", "اللائحة الداخلية لقسم الرقابة")
        if (!extractedAnnex) {
          const specificKeywords = cleanQuery.split(/\s+/).filter(w => w.length > 2 && !['ماذا', 'كيف', 'تنص', 'عن', 'في', 'من', 'ما', 'هو', 'هي', 'هل', 'على', 'يوجد', 'موجود', 'ذكر', 'بخصوص', 'اريد', 'اريده', 'اعطني', 'تفاصيل'].includes(w));
          
          let capturingKeywordAnnex = false;
          const capturedKLines: string[] = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const cleanLine = line.trim();
            if (cleanLine.includes(".....") || cleanLine.includes("........")) continue;

            const isHeader = /^#+\s+/.test(cleanLine);
            const matchesKw = specificKeywords.some(k => cleanLine.includes(k));

            if (isHeader && matchesKw && (cleanLine.includes("ملحق") || cleanLine.includes("جدول") || cleanLine.includes("لائحة") || cleanLine.includes("النظام"))) {
              capturingKeywordAnnex = true;
              capturedKLines.push(line);
            } else if (capturingKeywordAnnex) {
              if (/^#\s+ملحق|^#\s+الملحق/i.test(cleanLine)) {
                break;
              }
              capturedKLines.push(line);
              if (capturedKLines.length > 300) break; // Safeguard
            }
          }

          if (capturedKLines.length > 0) {
            matches.push(`📋 [📌 المحتوى والتفاصيل الكاملة للملحق المسترجع من ${docTitle}]:\n${capturedKLines.join('\n').trim()}`);
          }
        }
      }

      // --- SECTION B: Article Number Lookup (e.g. المادة 59، المادة 43، المادة 1، المادة 2) ---
      if (targetNum && !matches.some(m => m.includes(`للملحق (${targetNum})`))) {
        let capturing = false;
        let currentCaptured: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const cleanLine = line.trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());

          // Skip TOC lines with dots
          if (cleanLine.includes(".....") || cleanLine.includes("........")) continue;

          // Check if this line is an article header
          const isHeader = /(?:###|##|#)?\s*(?:المادة|مادة|البند)\s*[\(\\[]?\s*(\d+)/i.exec(cleanLine);

          if (isHeader) {
            const num = isHeader[1];
            if (num === targetNum.toString()) {
              if (capturing && currentCaptured.length > 0) {
                matches.push(`📜 [📌 نص رسمي للمادة (${targetNum}) من ${docTitle}]:\n${currentCaptured.join('\n').trim()}`);
                currentCaptured = [];
              }
              capturing = true;
              currentCaptured.push(line);
            } else if (capturing) {
              // Reached next article
              matches.push(`📜 [📌 نص رسمي للمادة (${targetNum}) من ${docTitle}]:\n${currentCaptured.join('\n').trim()}`);
              capturing = false;
              currentCaptured = [];
            }
          } else if (capturing) {
            if (/^#\s+|^##\s+الفصل|^##\s+ملحق/i.test(cleanLine) && currentCaptured.length > 3) {
              matches.push(`📜 [📌 نص رسمي للمادة (${targetNum}) من ${docTitle}]:\n${currentCaptured.join('\n').trim()}`);
              capturing = false;
              currentCaptured = [];
            } else {
              currentCaptured.push(line);
            }
          }
        }

        if (capturing && currentCaptured.length > 0) {
          matches.push(`📜 [📌 نص رسمي للمادة (${targetNum}) من ${docTitle}]:\n${currentCaptured.join('\n').trim()}`);
        }
      }

      // --- SECTION C: Keyword Based Semantic Search for Topics / Clauses ---
      const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2 && !['ماذا', 'كيف', 'تنص', 'عن', 'في', 'من', 'ما', 'هو', 'هي', 'هل', 'على', 'المادة', 'مادة', 'يوجد', 'موجود', 'ذكر', 'بخصوص', 'اريد', 'تفاصيل', 'جميع', 'كل', 'اقرأ', 'اعطني'].includes(w));
      if (queryWords.length > 0 && matches.length < 3) {
        const paragraphs = content.split(/\n\n+/);
        for (const p of paragraphs) {
          const pTrimmed = p.trim();
          if (pTrimmed.length < 25 || pTrimmed.includes(".....")) continue;
          const hitCount = queryWords.filter(kw => pTrimmed.includes(kw)).length;
          if (hitCount >= Math.min(2, queryWords.length)) {
            if (!matches.some(existing => existing.includes(pTrimmed.substring(0, 50)))) {
              matches.push(`📜 [📌 نص ذو صلة وثيقة من ${docTitle}]:\n${pTrimmed}`);
              if (matches.length >= 5) break;
            }
          }
        }
      }
    }

    return matches.slice(0, 8);
  }

  async searchCompanyDocuments(query: string, organizationId: number, maxChars: number = 100000): Promise<string[]> {
    const docs = await this.getDocuments(organizationId);
    if (docs.length === 0) {
      return ["لا توجد مستندات إضافية مرفوعة في قاعدة المعرفة."];
    }

    // P0-5 FIX: semantic re-ranking of documents using Gemini embeddings.
    // We compute the query embedding once and each document embedding once
    // (cached per doc for 30 min), then sort documents by cosine similarity.
    // If embeddings are unavailable (no GEMINI_API_KEY, API error), we keep
    // the original order — keyword/regex logic below still runs unchanged.
    let rankedDocs = docs;
    const queryEmbedding = await embedText(query);
    if (queryEmbedding) {
      const scored: { doc: KnowledgeDocument; sim: number }[] = [];
      for (const doc of docs) {
        const docEmb = await embedDocument(doc);
        scored.push({ doc, sim: docEmb ? cosineSim(queryEmbedding, docEmb) : 0 });
      }
      scored.sort((a, b) => b.sim - a.sim);
      rankedDocs = scored.map(s => s.doc);
      console.log(`[RAG] Semantic re-rank top doc: ${rankedDocs[0]?.title} (sim=${scored[0]?.sim?.toFixed(3)})`);
    }

    // First, check if there is an exact article / clause lookup
    const specificMatches = await this.findSpecificArticleOrClause(query, organizationId, rankedDocs);

    let totalChars = rankedDocs.reduce((acc, d) => acc + (d.content ? d.content.length : 0), 0);

    // If total content fits within maxChars, return full verbatim content of all documents
    if (totalChars <= maxChars) {
      const allDocs = rankedDocs.map(doc => `[مرجع نظامي كامل: ${doc.title || 'مستند بدون عنوان'}]:\n${doc.content}`);
      if (specificMatches.length > 0) {
        return [...specificMatches, ...allDocs];
      }
      return allDocs;
    }

    // When documents are very large, perform smart relevance ranking
    const queryTerms = (query || "").toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const auditKeywords = ['مادة', 'لائحة', 'قرار', 'صلاحيات', 'مخالفة', 'شكوى', 'تفتيش', 'عقد', 'مالي', 'إداري', 'صرف', 'إجراءات'];
    const allKeywords = Array.from(new Set([...queryTerms, ...auditKeywords]));

    const extractedSections: string[] = [];
    if (specificMatches.length > 0) {
      extractedSections.push(...specificMatches);
    }

    let currentBudget = maxChars - extractedSections.reduce((a, s) => a + s.length, 0);

    for (const doc of rankedDocs) {
      const docTitle = doc.title || 'مستند مرجعي';
      const content = doc.content || '';

      if (content.length < 5000) {
        extractedSections.push(`[مرجع نظامي: ${docTitle}]:\n${content}`);
        currentBudget -= content.length;
        continue;
      }

      // For large regulations, extract overview + top scored sections/articles
      const intro = content.substring(0, 2000);
      
      const rawChunks = content.split(/(?=(?:المادة|مادة|البند|الفصل|الفرع|جدول|المحور|القسم)\s*(?:\d+|[٠-٩]+|الأول|الثاني|الثالث|الرابع|الخامس|[أ-ي]))/i);
      
      const scoredChunks: { text: string; score: number }[] = [];
      for (const chunk of rawChunks) {
        const trimmed = chunk.trim();
        if (trimmed.length < 30) continue;
        let score = 0;
        const lowerChunk = trimmed.toLowerCase();
        for (const kw of allKeywords) {
          if (lowerChunk.includes(kw)) {
            score += 2;
          }
        }
        if (/مادة\s*(?:\d+|[٠-٩]+)|المادة\s*(?:الأولى|\d+|[٠-٩]+)|عقوبات|صلاحيات|إجراءات|ضوابط/i.test(trimmed)) {
          score += 3;
        }
        scoredChunks.push({ text: trimmed, score });
      }

      scoredChunks.sort((a, b) => b.score - a.score);

      const selectedParts: string[] = [
        `[مرجع نظامي شامل: ${docTitle}]\n--- الديباجة والتعريف العام ---\n${intro}\n\n--- أبرز المواد والبنود ذات الصلة ---`
      ];

      let docBudget = Math.min(currentBudget, Math.max(15000, Math.floor(maxChars / docs.length)));
      let usedInDoc = intro.length;

      for (const item of scoredChunks) {
        if (usedInDoc + item.text.length > docBudget) break;
        selectedParts.push(item.text);
        usedInDoc += item.text.length;
      }

      extractedSections.push(selectedParts.join('\n\n'));
      currentBudget -= usedInDoc;
      if (currentBudget <= 2000) break;
    }

    return extractedSections;
  }

  /**
   * Specifically tailored for Gemini Live Realtime WebSocket setup handshake.
   * Keeps payload compact (<7KB) to reduce live-session setup and first-response latency,
   * while supplying full structural awareness, document titles, and core regulatory articles.
   */
  async buildLivePromptContext(organizationId: number): Promise<string> {
    const cached = this.liveContextCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const docs = await this.getDocuments(organizationId);
    if (docs.length === 0) {
      return "لا توجد لوائح أو مستندات إضافية مرفوعة في قاعدة المعرفة. تصرف كمستشار إداري ورقابي عام.";
    }

    const docSummaries: string[] = [];
    const MAX_LIVE_CHARS = 7000;
    const perDocBudget = Math.floor(MAX_LIVE_CHARS / Math.min(docs.length, 6));

    for (const doc of docs.slice(0, 6)) {
      const docTitle = doc.title || 'لائحة تنظيمية';
      const content = doc.content || '';
      
      let excerpt = '';
      if (content.length <= perDocBudget) {
        excerpt = content;
      } else {
        const intro = content.substring(0, 1500);
        // Extract all article numbers, titles, annexes, and tables to give the AI full index awareness
        const articleMatches = content.match(/(?:المادة|مادة|البند)\s*[\(\\[]?\s*(?:\d+|[٠-٩]+|[^\n:–\-]{1,30})[\\]\)]?\s*[:\–\-]?[^\n]{0,120}/gi) || [];
        const annexMatches = content.match(/(?:ملحق|الملحق|جدول|الجدول|استمارة|الاستمارة|نموذج|النموذج)\s*[\(\\[]?\s*(?:\d+|[٠-٩]+|[^\n:–\-]{1,30})[\\]\)]?\s*[:\–\-]?[^\n]{0,120}/gi) || [];
        
        const indexedArticles = articleMatches.slice(0, 25).map(a => `• ${a.trim()}`).join('\n');
        const indexedAnnexes = annexMatches.slice(0, 10).map(a => `• 📋 ${a.trim()}`).join('\n');
        
        excerpt = `${intro}\n\n• فهرس المواد والبنود المسجلة في هذه اللائحة:\n${indexedArticles || 'تمت فهرسة بنود اللائحة بالكامل.'}${indexedAnnexes ? `\n\n• الملاحق والجداول المرفقة باللائحة:\n${indexedAnnexes}` : ''}`;
      }

      docSummaries.push(`📜 [وثيقة معتمدة: ${docTitle}]\n${excerpt}`);
    }

    const value = `قاعدة اللوائح والمراجع المعتمدة للمؤسسة (${docs.length} مستند):\n\n${docSummaries.join('\n\n---\n\n')}\n\nتوجيه رقابي للمستشار: اللوائح وموادها وملاحقها وجداولها المذكورة أعلاه مفهرسة بالكامل في ذاكرتك الرقابية ومسجلة في النظام. عند سؤالك عن أي مادة (مثل المادة 59، المادة 43) أو أي ملحق أو جدول (مثل الملحق رقم 1، جداول العقوبات، استمارات التفتيش)، استخدم أداة lookup_regulation_article فوراً لاستدعاء النص الكامل والتفاصيل الدقيقة والبنود الواردة فيها، وإياك قطعياً أن تقول للمستخدم إنه مجرد عنوان ولا توجد تفاصيل، لأن النصوص والتفاصيل مسجلة ومتاحة بالكامل في محرك الاسترجاع.`;
    this.liveContextCache.set(organizationId, { expiresAt: Date.now() + 60_000, value });
    return value;
  }

  async buildPromptContext(query: string, organizationId: number, maxChars: number = 100000): Promise<string> {
    const docs = await this.searchCompanyDocuments(query, organizationId, maxChars);
    return docs.join('\n\n---\n\n');
  }
}
