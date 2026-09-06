#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/logs"

start() {
  name="$1"; shift
  echo "Starting $name"
  setsid "$@" >"$ROOT/logs/$name.log" 2>&1 &
  echo $! >"$ROOT/logs/$name.pid"
}

start auth bash -lc "cd '$ROOT/services/auth-service' && exec mvn spring-boot:run"
start catalog bash -lc "cd '$ROOT/services/catalog-service' && exec go run ."
start inventory bash -lc "cd '$ROOT/services/inventory-service' && exec npm start"
start notifications bash -lc "cd '$ROOT/services/notification-service' && exec bundle exec ruby app.rb"
start orders bash -lc "cd '$ROOT/services/order-service' && source .venv/bin/activate && exec uvicorn app.main:app --host 0.0.0.0 --port 8084"
start payments bash -lc "cd '$ROOT/services/payment-service' && exec dotnet run"
start analytics bash -lc "cd '$ROOT/services/analytics-service' && exec php -S 0.0.0.0:8087 router.php"
start frontend bash -lc "cd '$ROOT/frontend' && exec npm run dev -- --host 0.0.0.0"

echo
echo "Started all processes."
echo "Logs: $ROOT/logs"
echo "Health: bash '$ROOT/scripts/health-check.sh'"
echo "UI: http://localhost:5173"
