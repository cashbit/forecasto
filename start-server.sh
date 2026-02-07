#!/bin/bash
cd "$(dirname "$0")/forecasto-server"
source .venv/bin/activate 2>/dev/null || true
uvicorn forecasto.main:app --reload --host 0.0.0.0 --port 8000
