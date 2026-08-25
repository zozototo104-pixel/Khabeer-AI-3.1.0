import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

// V6.1 SURGICAL FIX 1A — DATABASE DETECTION
// Previously this function rejected DATABASE_URL values containing the
// substring 'dpg-' (which is the NORMAL hostname prefix for Render
// PostgreSQL instances). That was a bug: it caused the server to fall
// back to the mock DB even when a perfectly valid Render PostgreSQL URL
// was provided. The check is now based on URL parseability + protocol,
// never on hostname substring matching.
function isPostgresUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

export const hasDatabaseConfig = () => {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && isPostgresUrl(dbUrl)) {
    return true; // Accept Render-style URLs (including those containing 'dpg-')
  }
  // Fall back to discrete SQL_* env vars (legacy / on-prem deployments)
  return Boolean(
    (process.env.SQL_HOST || process.env.PGHOST)
    && (process.env.SQL_USER || process.env.PGUSER)
    && (process.env.SQL_DB_NAME || process.env.PGDATABASE)
  );
};

// V6.1 SURGICAL FIX 1C — MOCK IS ALLOWED ONLY BEHIND AN EXPLICIT FLAG
// In production (NODE_ENV !== 'test' and ALLOW_MOCK_DB !== 'true'), the
// system MUST NOT fall back to mock data. If DATABASE_URL is missing or
// PostgreSQL is unreachable, every query MUST throw a controlled error
// that the API layer can surface to the user — NEVER silently return
// "Mock User" / "Mock Data" / "dummy_uid".
const isMockAllowed = (): boolean =>
  process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true';

export const createPool = () => {
  if (!global._postgresPool) {
    if (!hasDatabaseConfig()) {
      if (isMockAllowed()) {
        // Safe dummy pool for offline / preview mock mode (tests + dev only)
        const dummyPool: any = {
          query: async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 }),
          connect: async () => ({
            query: async () => ({ rows: [] }),
            release: () => {},
          }),
          end: async () => {},
          on: () => dummyPool,
        };
        global._postgresPool = dummyPool;
        return global._postgresPool;
      }
      // V6.1 SURGICAL FIX 1B — PRODUCTION FAIL-CLOSED
      // No DB config + no mock flag → throw immediately. The API layer
      // should catch this and return a controlled DATABASE_UNAVAILABLE
      // error to the client. NO silent mock.
      const err = new Error('DATABASE_UNAVAILABLE: DATABASE_URL is not configured and mock DB is not allowed in this environment (set ALLOW_MOCK_DB=true for dev/tests).');
      (err as any).code = 'DATABASE_UNAVAILABLE';
      throw err;
    }

    const databaseUrl = process.env.DATABASE_URL?.trim();
    const sslMode = process.env.SQL_SSL_MODE?.trim().toLowerCase();
    const maxConnections = Number(process.env.SQL_MAX_CONNECTIONS || 10);
    const port = Number(process.env.SQL_PORT || 5432);
    const config: PoolConfig = {
      ...(databaseUrl
        ? { connectionString: databaseUrl }
        : {
            host: process.env.SQL_HOST,
            port: Number.isInteger(port) ? port : 5432,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DB_NAME,
          }),
      max: Number.isInteger(maxConnections) && maxConnections > 0 ? maxConnections : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'smart-expert-enterprise',
    };

    if (sslMode === 'require') config.ssl = { rejectUnauthorized: false };
    if (sslMode === 'verify-full') config.ssl = { rejectUnauthorized: true };
    if (sslMode === 'disable') config.ssl = false;

    const newPool = new Pool(config);
    newPool.on('error', (err) => {
      console.warn('[Postgres Pool Error]:', err?.message || err);
    });
    global._postgresPool = newPool;
  }
  return global._postgresPool;
};

// V6.1 SURGICAL FIX 1B — FAIL-CLOSED DB WRAPPER
// When mock is allowed (test/dev), this returns the chainable mock.
// When mock is NOT allowed and the DB is unreachable, EVERY method on
// this wrapper throws DATABASE_UNAVAILABLE — so the API layer cannot
// accidentally return "Mock Data" to a real user.
const createChainableMock = () => {
  const chainable: any = new Proxy(() => [], {
    get: (target, prop) => {
      if (prop === 'then') return (resolve: any) => resolve([ { id: 1, uid: 'dummy_uid', nickname: 'Mock User', name: 'Mock Data' } ]);
      if (prop === 'catch') return () => chainable;
      if (prop === 'finally') return () => chainable;
      if (prop === 'query') return new Proxy({}, { get: () => ({ findMany: async () => [], findFirst: async () => null }) });
      if (prop === 'transaction') {
        return async (cb: (tx: any) => Promise<any>) => {
          if (typeof cb === 'function') {
            return await cb(chainable);
          }
          return chainable;
        };
      }
      if (prop === 'length') return 1;
      return chainable;
    },
    apply: (target, thisArg, args) => {
      if (args.length > 0 && typeof args[0] === 'function') {
        return args[0](chainable);
      }
      return chainable;
    }
  });
  return chainable;
};

// V6.1 SURGICAL FIX 1B — fail-closed wrapper. Any DB operation on this
// proxy throws DATABASE_UNAVAILABLE so the API layer surfaces a real
// error instead of returning fake data to the user.
const createFailClosedDb = (): any => {
  const fail = () => {
    const err = new Error('DATABASE_UNAVAILABLE: PostgreSQL connection is not usable in this environment. Set DATABASE_URL or ALLOW_MOCK_DB=true for dev/tests.');
    (err as any).code = 'DATABASE_UNAVAILABLE';
    throw err;
  };
  return new Proxy(() => fail(), {
    get: () => fail,
    apply: () => fail(),
  });
};

let dbInstance: any;

// V6.1 — create the pool safely. In production with no DB config,
// createPool() throws DATABASE_UNAVAILABLE. We catch that and create a
// fail-closed pool so module load doesn't crash (the error surfaces on
// first query instead).
let poolInstance: any;
try {
  poolInstance = createPool();
} catch (e: any) {
  if (isMockAllowed()) {
    // In test/dev, createPool() should have already returned a dummy pool.
    // If we're here, something went wrong — fall back to mock.
    poolInstance = createChainableMock();
  } else {
    console.error('[DB] createPool() failed, using fail-closed pool:', e?.message || e);
    poolInstance = createFailClosedDb();
  }
}

export const pool = poolInstance;

try {
  if (!hasDatabaseConfig()) {
    if (isMockAllowed()) {
      console.warn('[DB] No DATABASE_URL — using MOCK (NODE_ENV=test or ALLOW_MOCK_DB=true).');
      dbInstance = createChainableMock();
    } else {
      // V6.1: in production with no DB config, immediately fail-closed.
      // We still construct the wrapper (so module load doesn't crash) but
      // every operation on it throws DATABASE_UNAVAILABLE.
      console.error('[DB] DATABASE_URL is missing and mock is NOT allowed. All DB operations will fail-closed.');
      dbInstance = createFailClosedDb();
    }
  } else {
    // Has DB config → real pool. Drizzle constructor itself doesn't connect;
    // actual connection happens on first query. If the pool is unreachable
    // at query time, pg will throw — that error must propagate (no mock).
    dbInstance = drizzle(pool, { schema });
  }
} catch (e: any) {
  // Drizzle constructor can throw if the pool creation failed (e.g. bad
  // URL). In production, fail-closed. In test/dev, fall back to mock.
  if (isMockAllowed()) {
    console.warn('[DB] Drizzle constructor failed — using mock:', e?.message || e);
    dbInstance = createChainableMock();
  } else {
    console.error('[DB] Drizzle constructor failed and mock is NOT allowed:', e?.message || e);
    dbInstance = createFailClosedDb();
  }
}

export const db = dbInstance;
