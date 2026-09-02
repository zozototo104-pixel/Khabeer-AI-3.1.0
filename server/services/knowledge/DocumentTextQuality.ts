export interface DocumentTextQualityMetrics {
  length: number;
  visibleCharacters: number;
  letters: number;
  arabicCharacters: number;
  latinCharacters: number;
  digits: number;
  replacementCharacters: number;
  controlCharacters: number;
  privateUseCharacters: number;
  mojibakeMarkers: number;
  scriptTransitions: number;
  suspiciousSymbols: number;
  arabicCharacterRatio: number;
  arabicPresentationFormCharacters: number;
  arabicPresentationFormRatio: number;
  whitespaceCharacters: number;
  whitespaceRatio: number;
  arabicWordRuns: number;
  readableArabicWords: number;
  readableArabicWordRatio: number;
  isolatedArabicGlyphs: number;
  isolatedArabicGlyphRatio: number;
  suspiciousArabicWhitespaceGaps: number;
  scannerArtifactMarkers: number;
  scannerArtifactRatio: number;
  scannerArtifactRemainingVisibleCharacters: number;
  pageCount: number;
  charactersPerPage: number;
}

export interface DocumentTextQualityAssessment {
  usable: boolean;
  reason: string;
  reasons: string[];
  metrics: DocumentTextQualityMetrics;
}

export interface DocumentTextQualityOptions {
  pageCount?: number;
}

const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g;
const ARABIC_PRESENTATION_FORM_RE = /[\ufb50-\ufdff\ufe70-\ufeff]/g;
const ARABIC_RUN_RE = /[\u0621-\u063a\u0641-\u064a\u066e-\u066f\u0671-\u06d3\u06fa-\u06fc\u0750-\u077f\u08a0-\u08c9]+/g;
const ARABIC_ONLY_RE = /^[\u0621-\u063a\u0641-\u064a\u066e-\u066f\u0671-\u06d3\u06fa-\u06fc\u0750-\u077f\u08a0-\u08c9\u064b-\u065f\u0670\u06d6-\u06ed]+$/;
const LATIN_RE = /[A-Za-z]/g;
const DIGIT_RE = /[0-9\u0660-\u0669\u06f0-\u06f9]/g;
const REPLACEMENT_RE = /\uFFFD/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const PRIVATE_USE_RE = /[\uE000-\uF8FF]/g;
const MOJIBAKE_RE = /(?:Ã.|Â.|Ø.|Ù.|â€|â€™|â€œ|â€\u009d|ï¿½|�)/g;
const SCRIPT_TRANSITION_RE = /(?:[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff][A-Za-z]|[A-Za-z][\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff])/g;
const SCANNER_ARTIFACT_RE = /(?:created\s+in\s+(?:scanner\s+pro|scanner|camscanner|adobe\s+scan)|scanned\s+with\s+camscanner|scanner\s+pro)/gi;

// Characters commonly expected in Arabic/English business documents.
// Anything outside this set is not automatically wrong, but a high ratio is
// a strong signal that a PDF font map decoded glyph IDs instead of real text.
const ALLOWED_VISIBLE_RE = /[\p{L}\p{N}\p{M}\p{P}\p{S}\s]/u;

function count(text: string, expression: RegExp): number {
  return (text.match(expression) || []).length;
}

function normalizeArabicToken(token: string): string {
  return token
    .replace(/^[\p{P}\p{S}\p{N}_]+|[\p{P}\p{S}\p{N}_]+$/gu, '')
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '');
}

function measureArabicWordQuality(text: string): {
  arabicWordRuns: number;
  readableArabicWords: number;
  isolatedArabicGlyphs: number;
  suspiciousArabicWhitespaceGaps: number;
} {
  const tokens = text.split(/\s+/).filter(Boolean).map(normalizeArabicToken);
  const arabicTokens = tokens.filter((token) => token && ARABIC_ONLY_RE.test(token));
  let readableArabicWords = 0;
  let isolatedArabicGlyphs = 0;
  let suspiciousArabicWhitespaceGaps = 0;

  for (let index = 0; index < arabicTokens.length; index++) {
    const token = arabicTokens[index];
    if (token.length >= 2) readableArabicWords++;
    if (token.length === 1) isolatedArabicGlyphs++;
  }

  for (let index = 0; index < tokens.length - 1; index++) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (
      current.length === 1
      && next.length === 1
      && ARABIC_ONLY_RE.test(current)
      && ARABIC_ONLY_RE.test(next)
    ) {
      suspiciousArabicWhitespaceGaps++;
    }
  }

  return {
    arabicWordRuns: count(text, ARABIC_RUN_RE),
    readableArabicWords,
    isolatedArabicGlyphs,
    suspiciousArabicWhitespaceGaps,
  };
}

export function assessDocumentTextQuality(
  input: unknown,
  options: DocumentTextQualityOptions = {},
): DocumentTextQualityAssessment {
  const text = typeof input === 'string' ? input : String(input ?? '');
  const trimmed = text.trim();
  const visibleCharacters = count(trimmed, /\S/g);
  const arabicCharacters = count(text, ARABIC_RE);
  const arabicPresentationFormCharacters = count(text, ARABIC_PRESENTATION_FORM_RE);
  const latinCharacters = count(text, LATIN_RE);
  const digits = count(text, DIGIT_RE);
  const replacementCharacters = count(text, REPLACEMENT_RE);
  const controlCharacters = count(text, CONTROL_RE);
  const privateUseCharacters = count(text, PRIVATE_USE_RE);
  const mojibakeMarkers = count(text, MOJIBAKE_RE);
  const scriptTransitions = count(text, SCRIPT_TRANSITION_RE);
  const whitespaceCharacters = count(text, /\s/g);
  const letters = arabicCharacters + latinCharacters;
  const arabicCharacterRatio = letters > 0 ? arabicCharacters / letters : 0;
  const arabicPresentationFormRatio = visibleCharacters > 0
    ? arabicPresentationFormCharacters / visibleCharacters
    : 0;
  const whitespaceRatio = text.length > 0 ? whitespaceCharacters / text.length : 0;
  const pageCountValue = Math.floor(Number(options.pageCount || 0));
  const pageCount = Number.isFinite(pageCountValue) && pageCountValue > 0 ? pageCountValue : 0;
  const charactersPerPage = pageCount > 0 ? visibleCharacters / pageCount : 0;
  const {
    arabicWordRuns,
    readableArabicWords,
    isolatedArabicGlyphs,
    suspiciousArabicWhitespaceGaps,
  } = measureArabicWordQuality(text);
  const readableArabicWordRatio = arabicWordRuns > 0 ? readableArabicWords / arabicWordRuns : 0;
  const isolatedArabicGlyphRatio = arabicWordRuns > 0 ? isolatedArabicGlyphs / arabicWordRuns : 0;

  let suspiciousSymbols = 0;
  for (const char of text) {
    if (!char.trim()) continue;
    if (!ALLOWED_VISIBLE_RE.test(char)) suspiciousSymbols++;
  }

  const metrics: DocumentTextQualityMetrics = {
    length: text.length,
    visibleCharacters,
    letters,
    arabicCharacters,
    latinCharacters,
    digits,
    replacementCharacters,
    controlCharacters,
    privateUseCharacters,
    mojibakeMarkers,
    scriptTransitions,
    suspiciousSymbols,
    arabicCharacterRatio,
    arabicPresentationFormCharacters,
    arabicPresentationFormRatio,
    whitespaceCharacters,
    whitespaceRatio,
    arabicWordRuns,
    readableArabicWords,
    readableArabicWordRatio,
    isolatedArabicGlyphs,
    isolatedArabicGlyphRatio,
    suspiciousArabicWhitespaceGaps,
    pageCount,
    charactersPerPage,
  };

  const reasons: string[] = [];
  const reject = (reason: string, supportingReasons: string[] = []): DocumentTextQualityAssessment => ({
    usable: false,
    reason,
    reasons: [reason, ...supportingReasons.filter((value) => value !== reason)],
    metrics,
  });

  if (visibleCharacters < 8) {
    return reject('text_too_short_or_empty');
  }

  const visibleBase = Math.max(1, visibleCharacters);
  if (replacementCharacters >= 2 && replacementCharacters / visibleBase >= 0.001) {
    return reject('unicode_replacement_characters');
  }
  if (controlCharacters >= 2 && controlCharacters / Math.max(1, text.length) >= 0.001) {
    return reject('excessive_control_characters');
  }
  if (privateUseCharacters >= 2) {
    return reject('private_use_glyphs');
  }
  if (mojibakeMarkers >= 2) {
    return reject('suspected_mojibake');
  }

  // Arabic Presentation Forms are legitimate Unicode glyph code points, but
  // native PDF extraction should normally return logical Arabic letters. A
  // substantial share of presentation-form glyphs indicates that the PDF's
  // font mapping exposed visual glyph codes instead of reusable text. Treat
  // only a strong signal as unusable so ordinary Arabic and mixed documents
  // are unaffected and can fall back to OCR at the pipeline level.
  if (
    arabicPresentationFormCharacters >= 20
    && arabicPresentationFormRatio >= 0.08
  ) {
    return reject('arabic_presentation_form_extraction');
  }

  // Broken Arabic PDF ToUnicode maps frequently produce text that alternates
  // between Arabic glyphs and stray Latin letters with no word boundary.
  // Normal bilingual documents almost always separate the two scripts with
  // whitespace or punctuation, so repeated direct transitions are suspicious.
  if (arabicCharacters >= 20 && scriptTransitions >= 4) {
    return reject('broken_arabic_font_mapping');
  }

  const latinShare = letters > 0 ? latinCharacters / letters : 0;
  if (
    arabicCharacters >= 40
    && latinCharacters >= 12
    && latinShare >= 0.12
    && latinShare <= 0.75
    && scriptTransitions >= 2
  ) {
    return reject('implausible_mixed_script_text');
  }

  if (suspiciousSymbols >= 8 && suspiciousSymbols / visibleBase >= 0.03) {
    return reject('excessive_unmapped_symbols');
  }

  // Arabic fragmentation is evaluated only when there is a meaningful Arabic
  // sample. Low Arabic ratio by itself is never considered corruption, which
  // keeps legitimate mixed Arabic/English documents usable.
  const hasArabicSample = arabicCharacters >= 20 && arabicWordRuns >= 6;
  const fragmentedArabic = hasArabicSample && isolatedArabicGlyphRatio >= 0.45;
  const spacedArabicGlyphs = hasArabicSample && suspiciousArabicWhitespaceGaps >= 4;
  const lowReadableArabic = hasArabicSample && readableArabicWordRatio <= 0.35;
  const pathologicalWhitespace = text.length >= 80 && whitespaceRatio >= 0.62;
  const sparsePdf = pageCount >= 2 && charactersPerPage < 18 && visibleCharacters < Math.max(80, pageCount * 18);

  if (fragmentedArabic) reasons.push('isolated_arabic_glyph_fragmentation');
  if (spacedArabicGlyphs) reasons.push('suspicious_whitespace_between_arabic_letters');
  if (lowReadableArabic) reasons.push('low_readable_arabic_word_ratio');
  if (pathologicalWhitespace) reasons.push('pathological_whitespace_ratio');
  if (sparsePdf) reasons.push('suspiciously_low_characters_per_page');

  const arabicCorruptionSignals = [fragmentedArabic, spacedArabicGlyphs, lowReadableArabic].filter(Boolean).length;
  if (arabicCorruptionSignals >= 2) {
    return reject('fragmented_arabic_extraction', reasons);
  }

  if (pathologicalWhitespace && (fragmentedArabic || spacedArabicGlyphs || sparsePdf)) {
    return reject('pathological_whitespace_extraction', reasons);
  }

  if (sparsePdf && (fragmentedArabic || lowReadableArabic || suspiciousSymbols >= 2)) {
    return reject('suspiciously_sparse_pdf_text', reasons);
  }

  return { usable: true, reason: 'ok', reasons, metrics };
}

export interface PdfPageRange {
  start: number;
  end: number;
}

export function buildPdfPageRanges(totalPages: number, pagesPerRange = 20): PdfPageRange[] {
  const total = Math.floor(Number(totalPages));
  const chunk = Math.floor(Number(pagesPerRange));

  if (!Number.isFinite(total) || total <= 0) return [];
  if (!Number.isFinite(chunk) || chunk <= 0) {
    throw new RangeError('pagesPerRange must be a positive integer');
  }

  const ranges: PdfPageRange[] = [];
  for (let start = 1; start <= total; start += chunk) {
    ranges.push({ start, end: Math.min(total, start + chunk - 1) });
  }
  return ranges;
}
