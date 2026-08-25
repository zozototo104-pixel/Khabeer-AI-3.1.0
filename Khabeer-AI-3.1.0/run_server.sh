#!/bin/bash
# Unset sandbox-provided env vars that conflict with this project's expectations
unset DATABASE_URL
unset PGHOST PGUSER PGDATABASE PGPASSWORD PGPORT
unset FIREBASE_SERVICE_ACCOUNT_JSON
unset GEMINI_API_KEY

cd /home/z/my-project/smart-ai/Smart-AI-main
# Load project .env (does NOT override system env, so unsetting above is required)
export $(grep -v '^#' .env | xargs)

while true; do
  echo "[$(date)] Starting server..."
  npx tsx server.ts 2>&1
  echo "[$(date)] Server exited with code $?, restarting in 3s..."
  sleep 3
done
