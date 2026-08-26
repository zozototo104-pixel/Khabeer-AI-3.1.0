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
}

export interface DocumentTextQualityAssessment {
  usable: boolean;
  reason: string;
  metrics: DocumentTextQualityMetrics;
}

const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g;
const LATIN_RE = /[A-Za-z]/g;
const DIGIT_RE = /[0-9\u0660-\u0669\u06f0-\u06f9]/g;
const REPLACEMENT_RE = /\uFFFD/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const PRIVATE_USE_RE = /[\uE000-\uF8FF]/g;
const MOJIBAKE_RE = /(?:Ã.|Â.|Ø.|Ù.|â€|â€™|â€œ|â€\u009d|ï¿½|�)/g;
const SCRIPT_TRANSITION_RE = /(?:[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff][A-Za-z]|[A-Za-z][\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff])/g;

// Characters commonly expected in Arabic/English business documents.
// Anything outside this set is not automatically wrong, but a high ratio is
// a strong signal that a PDF font map decoded glyph IDs instead of real text.
const ALLOWED_VISIBLE_RE = /[\p{L}\p{N}\p{M}\p{P}\p{S}\s]/u;

function count(text: string, expression: RegExp): number {
  return (text.match(expression) || []).length;
}

export function assessDocumentTextQuality(input: unknown): DocumentTextQualityAssessment {
  const text = typeof input === 'string' ? input : String(input ?? '');
  const trimmed = text.trim();
  const visibleCharacters = count(trimmed, /\S/g);
  const arabicCharacters = count(text, ARABIC_RE);
  const latinCharacters = count(text, LATIN_RE);
  const digits = count(text, DIGIT_RE);
  const replacementCharacters = count(text, REPLACEMENT_RE);
  const controlCharacters = count(text, CONTROL_RE);
  const privateUseCharacters = count(text, PRIVATE_USE_RE);
  const mojibakeMarkers = count(text, MOJIBAKE_RE);
  const scriptTransitions = count(text, SCRIPT_TRANSITION_RE);
  const letters = arabicCharacters + latinCharacters;

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
  };

  if (visibleCharacters < 8) {
    return { usable: false, reason: 'text_too_short_or_empty', metrics };
  }

  const visibleBase = Math.max(1, visibleCharacters);
  if (replacementCharacters >= 2 && replacementCharacters / visibleBase >= 0.001) {
    return { usable: false, reason: 'unicode_replacement_characters', metrics };
  }
  if (controlCharacters >= 2 && controlCharacters / Math.max(1, text.length) >= 0.001) {
    return { usable: false, reason: 'excessive_control_characters', metrics };
  }
  if (privateUseCharacters >= 2) {
    return { usable: false, reason: 'private_use_glyphs', metrics };
  }
  if (mojibakeMarkers >= 2) {
    return { usable: false, reason: 'suspected_mojibake', metrics };
  }

  // Broken Arabic PDF ToUnicode maps frequently produce text that alternates
  // between Arabic glyphs and stray Latin letters with no word boundary.
  // Normal bilingual documents almost always separate the two scripts with
  // whitespace or punctuation, so repeated direct transitions are suspicious.
  if (arabicCharacters >= 20 && scriptTransitions >= 4) {
    return { usable: false, reason: 'broken_arabic_font_mapping', metrics };
  }

  const latinShare = letters > 0 ? latinCharacters / letters : 0;
  if (
    arabicCharacters >= 40 &&
    latinCharacters >= 12 &&
    latinShare >= 0.12 &&
    latinShare <= 0.75 &&
    scriptTransitions >= 2
  ) {
    return { usable: false, reason: 'implausible_mixed_script_text', metrics };
  }

  if (suspiciousSymbols >= 8 && suspiciousSymbols / visibleBase >= 0.03) {
    return { usable: false, reason: 'excessive_unmapped_symbols', metrics };
  }

  return { usable: true, reason: 'ok', metrics };
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
