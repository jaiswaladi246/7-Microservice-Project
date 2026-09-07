#!/usr/bin/env bash

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_DIR="$LOG_DIR/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

echo "=========================================="
echo " DevOps Shack - Polyglot Microservices"
echo " Setup + Startup"
echo "=========================================="

# ==================================================
# Helpers
# ==================================================

require_command() {
    COMMAND="$1"

    if ! command -v "$COMMAND" >/dev/null 2>&1; then
        echo
        echo "ERROR: '$COMMAND' is not installed."
        exit 1
    fi
}

start_service() {
    SLUG="$1"
    DISPLAY_NAME="$2"
    COMMAND="$3"
    HEALTH_URL="$4"

    PID_FILE="$PID_DIR/$SLUG.pid"
    LOG_FILE="$LOG_DIR/$SLUG.log"

    # Service may already be running manually.
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        echo "$DISPLAY_NAME is already running."
        return 0
    fi

    # Remove stale PID.
    if [ -f "$PID_FILE" ]; then
        OLD_PID="$(cat "$PID_FILE")"

        if kill -0 "$OLD_PID" >/dev/null 2>&1; then
            echo "$DISPLAY_NAME already has PID $OLD_PID"
            return 0
        fi

        rm -f "$PID_FILE"
    fi

    echo "Starting $DISPLAY_NAME..."

    setsid bash -lc "$COMMAND" \
        >"$LOG_FILE" \
        2>&1 \
        < /dev/null &

    PID=$!

    echo "$PID" > "$PID_FILE"

    echo "$DISPLAY_NAME started with PID $PID"
}

wait_for_service() {
    SLUG="$1"
    DISPLAY_NAME="$2"
    HEALTH_URL="$3"

    echo "Waiting for $DISPLAY_NAME..."

    for i in $(seq 1 60); do

        if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
            echo "✓ $DISPLAY_NAME is UP"
            return 0
        fi

        sleep 1
    done

    echo
    echo "ERROR: $DISPLAY_NAME failed to start."
    echo
    echo "Check log:"
    echo "$LOG_DIR/$SLUG.log"
    echo
    echo "Last 30 log lines:"
    tail -30 "$LOG_DIR/$SLUG.log" 2>/dev/null || true

    exit 1
}

install_node_dependencies() {
    DIRECTORY="$1"
    NAME="$2"

    if [ -d "$DIRECTORY/node_modules" ]; then
        echo "✓ $NAME dependencies already installed."
        return
    fi

    echo "Installing $NAME dependencies..."

    cd "$DIRECTORY"

    if [ -f package-lock.json ]; then
        npm ci
    else
        npm install
    fi

    cd "$ROOT_DIR"
}

# ==================================================
# Required software
# ==================================================

echo
echo "[1/10] Checking required tools..."

for cmd in curl pg_isready java mvn go node npm python3 dotnet ruby gem php; do
    require_command "$cmd"
done

echo "✓ Required runtimes are available."

# ==================================================
# PostgreSQL
# ==================================================

echo
echo "[2/10] Checking PostgreSQL..."

if pg_isready \
    -h 127.0.0.1 \
    -p 5432 \
    >/dev/null 2>&1
then
    echo "✓ PostgreSQL is already running."
else
    echo "Starting PostgreSQL..."

    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl start postgresql
    else
        sudo service postgresql start
    fi

    sleep 2

    if ! pg_isready \
        -h 127.0.0.1 \
        -p 5432 \
        >/dev/null 2>&1
    then
        echo "ERROR: PostgreSQL failed to start."
        exit 1
    fi

    echo "✓ PostgreSQL started."
fi

# ==================================================
# Go dependencies
# ==================================================

echo
echo "[3/10] Preparing Go Catalog Service..."

cd "$ROOT_DIR/services/catalog-service"

go mod download

cd "$ROOT_DIR"

echo "✓ Go dependencies ready."

# ==================================================
# Inventory Node dependencies
# ==================================================

echo
echo "[4/10] Preparing Node Inventory Service..."

install_node_dependencies \
    "$ROOT_DIR/services/inventory-service" \
    "Inventory Service"

# ==================================================
# Python environment
# ==================================================

echo
echo "[5/10] Preparing Python Order Service..."

ORDER_DIR="$ROOT_DIR/services/order-service"

if [ ! -d "$ORDER_DIR/.venv" ]; then

    echo "Creating Python virtual environment..."

    python3 -m venv "$ORDER_DIR/.venv"

fi

if ! "$ORDER_DIR/.venv/bin/python" -c \
    "import fastapi, uvicorn, psycopg2, httpx, pydantic, email_validator" \
    >/dev/null 2>&1
then

    echo "Installing Python dependencies..."

    "$ORDER_DIR/.venv/bin/python" \
        -m pip install \
        --upgrade pip

    "$ORDER_DIR/.venv/bin/python" \
        -m pip install \
        -r "$ORDER_DIR/requirements.txt"

else

    echo "✓ Python dependencies already installed."

fi

# ==================================================
# .NET dependencies
# ==================================================

echo
echo "[6/10] Preparing .NET Payment Service..."

cd "$ROOT_DIR/services/payment-service"

dotnet restore

cd "$ROOT_DIR"

echo "✓ .NET dependencies ready."

# ==================================================
# Ruby dependencies
# ==================================================

echo
echo "[7/10] Preparing Ruby Notification Service..."

export GEM_HOME="$HOME/.local/share/gem/ruby/3.3.0"
export GEM_PATH="$GEM_HOME"
export PATH="$GEM_HOME/bin:$PATH"

if ! command -v bundle >/dev/null 2>&1; then

    echo "Installing Bundler..."

    gem install bundler

fi

cd "$ROOT_DIR/services/notification-service"

bundle config set --local path "$HOME/.bundle"

if bundle check >/dev/null 2>&1; then

    echo "✓ Ruby dependencies already installed."

else

    echo "Installing Ruby dependencies..."

    bundle install

fi

cd "$ROOT_DIR"

# ==================================================
# PHP dependencies/extensions
# ==================================================

echo
echo "[8/10] Checking PHP Analytics Service..."

if ! php -m | grep -qi "^pdo_pgsql$"; then

    echo "ERROR: PHP PostgreSQL extension is missing."
    echo
    echo "Install:"
    echo "sudo apt install -y php-pgsql"
    exit 1

fi

if ! php -m | grep -qi "^curl$"; then

    echo "ERROR: PHP curl extension is missing."
    echo
    echo "Install:"
    echo "sudo apt install -y php-curl"
    exit 1

fi

echo "✓ PHP extensions ready."

# ==================================================
# Frontend dependencies
# ==================================================

echo
echo "[9/10] Preparing React Frontend..."

install_node_dependencies \
    "$ROOT_DIR/frontend" \
    "React Frontend"

# ==================================================
# Start backend services
# ==================================================

echo
echo "[10/10] Starting application..."
echo

# --------------------------------------------------
# Java Auth
# --------------------------------------------------

start_service \
    "auth" \
    "Auth Service" \
    "cd '$ROOT_DIR/services/auth-service' && exec mvn spring-boot:run" \
    "http://127.0.0.1:8081/health"

wait_for_service \
    "auth" \
    "Auth Service" \
    "http://127.0.0.1:8081/health"

# --------------------------------------------------
# Go Catalog
# --------------------------------------------------

start_service \
    "catalog" \
    "Catalog Service" \
    "cd '$ROOT_DIR/services/catalog-service' && exec go run ." \
    "http://127.0.0.1:8082/health"

wait_for_service \
    "catalog" \
    "Catalog Service" \
    "http://127.0.0.1:8082/health"

# --------------------------------------------------
# Node Inventory
# --------------------------------------------------

start_service \
    "inventory" \
    "Inventory Service" \
    "cd '$ROOT_DIR/services/inventory-service' && exec npm start" \
    "http://127.0.0.1:8083/health"

wait_for_service \
    "inventory" \
    "Inventory Service" \
    "http://127.0.0.1:8083/health"

# --------------------------------------------------
# Ruby Notification
# --------------------------------------------------

start_service \
    "notification" \
    "Notification Service" \
    "export GEM_HOME='$HOME/.local/share/gem/ruby/3.3.0';
     export GEM_PATH=\"\$GEM_HOME\";
     export PATH=\"\$GEM_HOME/bin:\$PATH\";
     cd '$ROOT_DIR/services/notification-service';
     exec bundle exec ruby app.rb" \
    "http://127.0.0.1:8086/health"

wait_for_service \
    "notification" \
    "Notification Service" \
    "http://127.0.0.1:8086/health"

# --------------------------------------------------
# Python Order
# --------------------------------------------------

start_service \
    "order" \
    "Order Service" \
    "cd '$ROOT_DIR/services/order-service' &&
     exec .venv/bin/uvicorn app.main:app \
     --host 0.0.0.0 \
     --port 8084" \
    "http://127.0.0.1:8084/health"

wait_for_service \
    "order" \
    "Order Service" \
    "http://127.0.0.1:8084/health"

# --------------------------------------------------
# .NET Payment
# --------------------------------------------------

start_service \
    "payment" \
    "Payment Service" \
    "cd '$ROOT_DIR/services/payment-service' &&
     exec dotnet run --no-restore" \
    "http://127.0.0.1:8085/health"

wait_for_service \
    "payment" \
    "Payment Service" \
    "http://127.0.0.1:8085/health"

# --------------------------------------------------
# PHP Analytics
# --------------------------------------------------

start_service \
    "analytics" \
    "Analytics Service" \
    "cd '$ROOT_DIR/services/analytics-service' &&
     exec php -S 0.0.0.0:8087 router.php" \
    "http://127.0.0.1:8087/health"

wait_for_service \
    "analytics" \
    "Analytics Service" \
    "http://127.0.0.1:8087/health"

# ==================================================
# Start React
# ==================================================

FRONTEND_PID="$PID_DIR/frontend.pid"
FRONTEND_LOG="$LOG_DIR/frontend.log"

if curl -fsS \
    "http://127.0.0.1:5173" \
    >/dev/null 2>&1
then

    echo "React Frontend is already running."

else

    echo "Starting React Frontend..."

    setsid bash -lc \
        "cd '$ROOT_DIR/frontend' &&
         exec npm run dev -- --host 0.0.0.0" \
        >"$FRONTEND_LOG" \
        2>&1 \
        < /dev/null &

    echo $! > "$FRONTEND_PID"

fi

echo "Waiting for React Frontend..."

for i in $(seq 1 30); do

    if curl -fsS \
        "http://127.0.0.1:5173" \
        >/dev/null 2>&1
    then
        echo "✓ React Frontend is UP"
        break
    fi

    sleep 1

done

# ==================================================
# Final health check
# ==================================================

echo
echo "=========================================="
echo " FINAL HEALTH CHECK"
echo "=========================================="

declare -A SERVICES=(
    ["Auth"]="8081"
    ["Catalog"]="8082"
    ["Inventory"]="8083"
    ["Order"]="8084"
    ["Payment"]="8085"
    ["Notification"]="8086"
    ["Analytics"]="8087"
)

for NAME in \
    Auth \
    Catalog \
    Inventory \
    Order \
    Payment \
    Notification \
    Analytics
do

    PORT="${SERVICES[$NAME]}"

    if curl -fsS \
        "http://127.0.0.1:$PORT/health" \
        >/dev/null 2>&1
    then

        printf "%-15s : UP   (:%s)\n" \
            "$NAME" \
            "$PORT"

    else

        printf "%-15s : DOWN (: %s)\n" \
            "$NAME" \
            "$PORT"

    fi

done

echo
echo "Frontend        : UP   (:5173)"

echo
echo "=========================================="
echo " APPLICATION READY"
echo "=========================================="

echo
echo "Frontend:"
echo "http://<EC2-PUBLIC-IP>:5173"

echo
echo "Logs:"
echo "$LOG_DIR"

echo
echo "Useful commands:"
echo
echo "  tail -f logs/auth.log"
echo "  tail -f logs/inventory.log"
echo "  tail -f logs/order.log"
echo "  tail -f logs/notification.log"
echo "  tail -f logs/frontend.log"

echo
echo "Stop application:"
echo
echo "  ./scripts/stop-all.sh"
echo
