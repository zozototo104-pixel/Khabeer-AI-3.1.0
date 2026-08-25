---
Task ID: 1
Agent: main (Super Z)
Task: Run the program contained in Smart-AI-FINAL-realtime-human-speaker.zip

Work Log:
- Extracted /home/z/my-project/upload/Smart-AI-FINAL-realtime-human-speaker.zip to /home/z/my-project/smart-ai/Smart-AI-main
- Identified project as a TypeScript full-stack app: Express + Vite + React, with PostgreSQL (drizzle-orm), Firebase Admin Auth, Gemini Live API, and sherpa-onnx-node neural speaker recognition
- Ran `npm install` — 672 packages installed successfully
- Created `.env` with safe dev defaults (direct-auth fallback enabled, mock DB mode, no Gemini key)
- Discovered sandbox-provided `DATABASE_URL=file:/home/z/my-project/db/custom.db` was confusing the postgres-only driver into attempting a real connection (ECONNREFUSED). Wrote `/home/z/my-project/scripts/run_server.sh` wrapper that unsets `DATABASE_URL`, `PG*`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `GEMINI_API_KEY` before launching so the project falls back to its built-in mock pool
- Started server via `setsid bash run_server.sh` so the dev process is fully detached
- Verified all subsystems boot cleanly: Express on :3000, Vite dev middleware, neural speaker model (sherpa-onnx 1.13.6 / ONNX Runtime 1.27.1 / 3D-Speaker ERes2Net 512-dim, SHA-256 verified), mock DB pool
- Smoke-tested endpoints in a single bash session:
  * GET /api/health → 200 `{"status":"ok","version":"3.0.2"}`
  * GET /api/ready → 200 `{"status":"ready","database":"mock","speakerModel":"ok","speakerMode":"NEURAL"}`
  * POST /api/auth/direct-session → 200 with valid direct token
  * GET /api/speaker/model-health (with Bearer token) → 200 with full neural model info
  * GET /api/sessions (with Bearer token) → 200 mock data
  * GET /api/experts (with Bearer token) → 200 full expert catalog (29 experts, Arabic)
  * GET / → 200 HTML (2118 bytes, Arabic RTL, "الخبير الذكي - منصة إدارة الاجتماعات والحوكمة")

Stage Summary:
- The program RUNS successfully in dev mode (`npm run dev` → tsx server.ts on port 3000)
- Sandbox limitation: background processes are killed when the bash tool session ends, so the server cannot be kept alive across multiple bash invocations. Each verification requires re-launching in the same session.
- Required external services that are NOT configured in this sandbox:
  * PostgreSQL — falling back to in-memory mock (data not persisted)
  * Firebase service account JSON — falling back to projectId-only init
  * GEMINI_API_KEY — empty, so AI voice/text features return errors but the rest of the UI works
- To run the same program on a real machine, the user needs:
  1. Node.js 22-24
  2. PostgreSQL with migrations applied (`npm run db:migrate`)
  3. Firebase service account JSON in `FIREBASE_SERVICE_ACCOUNT_JSON`
  4. `GEMINI_API_KEY` with Live API access
  5. Then `npm ci && npm run dev` — server starts on http://localhost:3000
- Artifacts:
  * Project root: /home/z/my-project/smart-ai/Smart-AI-main/
  * Env file: /home/z/my-project/smart-ai/Smart-AI-main/.env
  * Launch wrapper: /home/z/my-project/scripts/run_server.sh
  * Server log: /home/z/my-project/smart-ai/server.log
