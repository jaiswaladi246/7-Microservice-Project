#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT_DIR/logs/pids"

echo "=========================================="
echo " DevOps Shack - Stopping Microservices"
echo "=========================================="

if [ ! -d "$PID_DIR" ]; then
    echo "No PID directory found."
    echo "Nothing to stop."
    exit 0
fi

stop_service() {
    SLUG="$1"
    DISPLAY_NAME="$2"

    PID_FILE="$PID_DIR/$SLUG.pid"

    if [ ! -f "$PID_FILE" ]; then
        echo "$DISPLAY_NAME: no PID file found"
        return
    fi

    PID="$(cat "$PID_FILE")"

    if kill -0 "$PID" 2>/dev/null; then

        echo "Stopping $DISPLAY_NAME (PID $PID)..."

        # The start script uses setsid,
        # so kill the complete process group.
        kill -- "-$PID" 2>/dev/null || kill "$PID" 2>/dev/null

        # Wait up to 10 seconds
        for i in $(seq 1 10); do
            if ! kill -0 "$PID" 2>/dev/null; then
                break
            fi
            sleep 1
        done

        # Force kill only if still alive
        if kill -0 "$PID" 2>/dev/null; then
            echo "$DISPLAY_NAME did not stop gracefully. Force stopping..."
            kill -9 -- "-$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null
        fi

        echo "✓ $DISPLAY_NAME stopped"

    else
        echo "$DISPLAY_NAME is already stopped"
    fi

    rm -f "$PID_FILE"
}

echo

stop_service "frontend" "React Frontend"
stop_service "analytics" "Analytics Service"
stop_service "payment" "Payment Service"
stop_service "order" "Order Service"
stop_service "notification" "Notification Service"
stop_service "inventory" "Inventory Service"
stop_service "catalog" "Catalog Service"
stop_service "auth" "Auth Service"

echo
echo "=========================================="
echo " Application services stopped"
echo "=========================================="
echo
echo "PostgreSQL was NOT stopped."
echo "This is intentional because PostgreSQL may be used by other applications."
