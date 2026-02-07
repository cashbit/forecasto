#!/bin/bash
DIR="$(dirname "$0")"

echo "Starting Forecasto Server..."
(cd "$DIR/forecasto-server" && source .venv/bin/activate 2>/dev/null || true && uvicorn forecasto.main:app --reload --host 0.0.0.0 --port 8000) &
SERVER_PID=$!

echo "Starting Forecasto Client..."
(cd "$DIR/forecasto-client-web" && npm run dev) &
CLIENT_PID=$!

trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit" INT TERM

echo "Server PID: $SERVER_PID | Client PID: $CLIENT_PID"
echo "Press Ctrl+C to stop both."
wait
