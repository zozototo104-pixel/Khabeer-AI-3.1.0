/**
 * P2 FIX: Audit trail + rate limiting + token revocation services.
 *
 * These three lightweight services are used by all the new P1/P2 fixes
 * so we have a single place to record mutations, throttle abuse, and
 * revoke direct-session tokens without polluting server.ts.
 *
 * When the DB is in mock mode (no PostgreSQL), all three services degrade
 * gracefully to no-ops + console.warn — the application remains usable.
 */

import { db } from '../../../src/db/index.ts';
import { auditLog, rateLimitCounters, revokedTokens } from '../../../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// AuditService — append-only audit trail
// ---------------------------------------------------------------------------
export interface AuditEntry {
  uid?: string | null;
  orgId?: number | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'PERMISSION' | 'REVOKE' | 'RATE_LIMIT';
  entityType: string;       // 'session' | 'knowledge' | 'speaker' | 'organization' | 'user' | 'decision' | 'risk' | 'violation' | 'token'
  entityId?: string | null;
  summary?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      uid: entry.uid ?? null,
      orgId: entry.orgId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ? String(entry.entityId) : null,
      summary: entry.summary?.slice(0, 500) ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e: any) {
    // Never let audit failure break the request flow.
    console.warn('[Audit] Failed to record entry:', e?.message || String(e));
  }
}

// ---------------------------------------------------------------------------
// RateLimitService — fixed-window counter per bucket_key
// ---------------------------------------------------------------------------
export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  windowMs: number;
}

export async function checkRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    const rows = await db.select().from(rateLimitCounters).where(eq(rateLimitCounters.bucketKey, bucketKey)).limit(1);
    const now = Date.now();
    const existing = rows[0];
    if (existing) {
      const windowStartMs = existing.windowStart ? new Date(existing.windowStart as any).getTime() : 0;
      const inWindow = (now - windowStartMs) < windowMs;
      if (inWindow) {
        const newCount = (existing.count || 0) + 1;
        if (newCount > limit) {
          await recordAudit({
            action: 'RATE_LIMIT',
            entityType: 'rate_limit',
            entityId: bucketKey,
            summary: `Rate limit exceeded (${limit}/${windowMs}ms)`,
          });
          return { allowed: false, count: newCount, limit, windowMs };
        }
        await db.update(rateLimitCounters)
          .set({ count: newCount })
          .where(eq(rateLimitCounters.bucketKey, bucketKey));
        return { allowed: true, count: newCount, limit, windowMs };
      }
      await db.update(rateLimitCounters)
        .set({ count: 1, windowStart: new Date() })
        .where(eq(rateLimitCounters.bucketKey, bucketKey));
      return { allowed: true, count: 1, limit, windowMs };
    }
    await db.insert(rateLimitCounters).values({ bucketKey, count: 1, windowStart: new Date() });
    return { allowed: true, count: 1, limit, windowMs };
  } catch (e: any) {
    console.warn('[RateLimit] check failed (fail-open):', e?.message || String(e));
    return { allowed: true, count: 0, limit, windowMs };
  }
}

// ---------------------------------------------------------------------------
// TokenRevocationService — blocklist for direct-session tokens
// ---------------------------------------------------------------------------
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function revokeToken(token: string, uid: string, reason: string = 'user_request'): Promise<void> {
  if (!token) return;
  try {
    const tokenHash = hashToken(token);
    await db.insert(revokedTokens).values({
      tokenHash,
      uid,
      reason,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await recordAudit({
      uid,
      action: 'REVOKE',
      entityType: 'token',
      entityId: tokenHash.slice(0, 12),
      summary: `Token revoked: ${reason}`,
    });
  } catch (e: any) {
    console.warn('[TokenRevocation] Failed to revoke:', e?.message || String(e));
  }
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  if (!token) return false;
  // P0-1 workaround: when the DB pool is the mock pool (no PostgreSQL),
  // select() calls always resolve to a non-empty array (the dummy row).
  // That would make isTokenRevoked ALWAYS return true and lock everyone out.
  // Detect that mode by checking hasDatabaseConfig(), and skip the check.
  const { hasDatabaseConfig } = await import('../../../src/db/index.ts');
  if (!hasDatabaseConfig()) {
    // Mock mode — no persistence, so no revocation list.
    return false;
  }
  try {
    const tokenHash = hashToken(token);
    const rows = await db.select().from(revokedTokens).where(eq(revokedTokens.tokenHash, tokenHash)).limit(1);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e: any) {
    console.warn('[TokenRevocation] Check failed (fail-open):', e?.message || String(e));
    return false;
  }
}
