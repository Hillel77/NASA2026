#!/usr/bin/env bash
# One-command start: builds the frontend (if needed) and serves everything from FastAPI on :8000.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
. .venv/bin/activate
pip install -q -r backend/requirements.txt
if [ ! -d frontend/node_modules ]; then (cd frontend && npm install); fi
if [ ! -d frontend/dist ] || [ "${REBUILD:-0}" = "1" ]; then (cd frontend && npm run build); fi
cd backend && exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
