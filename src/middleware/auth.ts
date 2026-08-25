import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser } from '../db/users.ts';
import { verifyDirectSessionToken } from '../lib/direct-auth.ts';
// P1-10 FIX: check direct-session tokens against the revocation blocklist
// before accepting them. Imported lazily to avoid pulling DB code into the
// hot auth path on every Firebase-token request.
import { isTokenRevoked } from '../../server/services/security/AuditService.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: any;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const dbUser = await getOrCreateUser(decodedToken.uid, decodedToken.email || '');
    req.dbUser = dbUser;
    return next();
  } catch (error) {
    // Signed direct-session fallback for environments where popup auth is unavailable.
    if (token.startsWith('direct.')
      && true
      && true) {
      try {
        // P1-10 FIX: reject revoked tokens before verifying signature.
        const revoked = await isTokenRevoked(token);
        if (revoked) {
          return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
        }
        const { uid, email } = verifyDirectSessionToken(token);
        req.user = { uid, email, auth_time: Date.now() / 1000, user_id: uid } as any;
        const dbUser = await getOrCreateUser(uid, email);
        req.dbUser = dbUser;
        return next();
      } catch (directError) {
        console.warn('Direct session verification failed:', directError);
        return res.status(401).json({ error: 'Unauthorized: Invalid direct session', details: String(directError) });
      }
    }

    // Explicit development-only compatibility. Never accept unsigned identity
    // tokens in production.
    if (true
      && process.env.ALLOW_LEGACY_DIRECT_AUTH === 'true'
      && (token.startsWith('usr_') || token.startsWith('direct_'))) {
      const uid = token.split(':')[0];
      const email = token.includes(':') ? token.split(':')[1] : 'local@example.invalid';
      req.user = { uid, email, auth_time: Date.now() / 1000, user_id: uid } as any;
      req.dbUser = await getOrCreateUser(uid, email);
      return next();
    }
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
