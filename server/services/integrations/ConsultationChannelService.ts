import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ConsultationTokenPayload {
  callId: number;
  orgId: number;
  sessionId: number;
  ownerUid: string;
  expertIds: string[];
  leadExpertId: string;
  consentRecorded: true;
  exp: number;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export function issueConsultationToken(payload: Omit<ConsultationTokenPayload, 'exp'>, secret: string, lifetimeSeconds = 900): string {
  if (secret.length < 32) throw new Error('EXPERT_CHANNEL_SECRET_MUST_BE_AT_LEAST_32_CHARACTERS');
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds }));
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyConsultationToken(token: unknown, secret: string): ConsultationTokenPayload {
  if (typeof token !== 'string' || !token.includes('.')) throw new Error('INVALID_CONSULTATION_TOKEN');
  const [body, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update(body).digest();
  const supplied = Buffer.from(signature || '', 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('INVALID_CONSULTATION_TOKEN');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ConsultationTokenPayload;
  if (!payload.consentRecorded || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('EXPIRED_OR_UNCONSENTED_CONSULTATION_TOKEN');
  if (!Number.isInteger(payload.callId) || !Number.isInteger(payload.orgId) || !Number.isInteger(payload.sessionId)) throw new Error('INVALID_CONSULTATION_TOKEN_PAYLOAD');
  return payload;
}

const xmlEscape = (value: string) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char] || char));

export function buildTwilioStreamTwiml(streamUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ar-XA">سيتم الآن توصيلك بمنصة الخبير الذكي. هذه المكالمة مسجلة بموافقتك.</Say><Connect><Stream url="${xmlEscape(streamUrl)}" /></Connect></Response>`;
}

function muLawToLinearSample(muLawByte: number): number {
  const value = (~muLawByte) & 0xff;
  const sign = value & 0x80;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

function linearToMuLawSample(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  let magnitude = Math.min(CLIP, Math.abs(Math.round(sample))) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (magnitude & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

export function twilioMuLaw8kToPcm16kBase64(payload: string): string {
  const source = Buffer.from(payload, 'base64');
  const pcm = Buffer.allocUnsafe(source.length * 4);
  for (let i = 0; i < source.length; i++) {
    const sample = muLawToLinearSample(source[i]);
    pcm.writeInt16LE(sample, i * 4);
    pcm.writeInt16LE(sample, i * 4 + 2);
  }
  return pcm.toString('base64');
}

export function pcm24kBase64ToTwilioMuLaw8k(payload: string): string {
  const pcm = Buffer.from(payload, 'base64');
  const samples = Math.floor(pcm.length / 2);
  const output = Buffer.allocUnsafe(Math.ceil(samples / 3));
  let out = 0;
  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 3) {
    output[out++] = linearToMuLawSample(pcm.readInt16LE(sampleIndex * 2));
  }
  return output.subarray(0, out).toString('base64');
}

export function getConsultationCapabilities() {
  return [
    { id: 'INTERNAL_LIVE', name: 'الاجتماع الصوتي داخل المنصة', status: 'AVAILABLE', mode: 'BIDIRECTIONAL_REALTIME', notes: 'يدعم بصمات المتحدثين والأدوات والمحاضر.' },
    { id: 'BROWSER_SPEAKER_BRIDGE', name: 'جسر مكبر الصوت', status: 'AVAILABLE', mode: 'DEVICE_AUDIO', notes: 'ضع مكالمة أي تطبيق على مكبر الصوت واستخدم اجتماع المنصة مع موافقة الحاضرين.' },
    { id: 'WHATSAPP_BUSINESS_CALLING_TWILIO', name: 'WhatsApp Business Calling عبر Twilio', status: 'CONDITIONAL', mode: 'BIDIRECTIONAL_MEDIA_STREAM', notes: 'يتطلب WABA مؤهلاً ورقماً تجارياً وموافقة المستخدم وPUBLIC_BASE_URL وEXPERT_CHANNEL_SECRET وإعداد Twilio.' },
    { id: 'MESSENGER_CALL_JOIN', name: 'الانضمام إلى مكالمة Messenger شخصية', status: 'UNSUPPORTED_BY_PLATFORM', mode: 'NONE', notes: 'لا توفر منصة Messenger واجهة رسمية لانضمام بوت إلى مكالمات الأفراد.' },
  ];
}
