# DevOps Shack Polyglot Microservices Lab

A complete **7-microservice**, multi-language application that runs locally **without Docker**.

## Architecture

| Port | Service | Language / Framework | Responsibility | PostgreSQL DB |
|---|---|---|---|---|
| 8081 | Auth Service | Java 21 + Spring Boot | Register, login, session lookup | `auth_db` |
| 8082 | Catalog Service | Go | Product CRUD, search, pricing | `catalog_db` |
| 8083 | Inventory Service | Node.js + Express | Stock, adjust, reserve/release | `inventory_db` |
| 8084 | Order Service | Python + FastAPI | Checkout orchestration and order lifecycle | `order_db` |
| 8085 | Payment Service | C# + ASP.NET Core | Capture/refund simulated payments | `payment_db` |
| 8086 | Notification Service | Ruby + Sinatra | Notification inbox | `notification_db` |
| 8087 | Analytics Service | PHP | Aggregate service APIs and save snapshots | `analytics_db` |
| 5173 | Web UI | React + Vite | User interface | — |

PostgreSQL is installed once locally, but every backend service owns a **different database**.

## Complete business flow

```text
React UI
  |
  +--> Auth :8081 ------------------------> auth_db
  +--> Catalog :8082 ---------------------> catalog_db
  +--> Inventory :8083 -------------------> inventory_db
  +--> Orders :8084 ----------------------> order_db
  |       |--> Catalog API (validate product + price)
  |       |--> Inventory API (reserve stock)
  |       `--> Notification API
  +--> Payments :8085 --------------------> payment_db
  |       |--> Orders API (PAID / REFUNDED)
  |       `--> Notification API
  +--> Notifications :8086 --------------> notification_db
  `--> Analytics :8087 ------------------> analytics_db
          |--> Catalog API
          |--> Inventory API
          |--> Orders API
          `--> Payments API
```

## Implemented functionality

- User registration and login
- Persisted session token
- Seed admin account
- Product CRUD
- Product search
- Seed product catalog
- Inventory lookup
- Stock increase/decrease
- Transactional stock reservation
- Transactional release
- Cart UI
- Order creation
- Authoritative price lookup from Catalog
- Inventory reservation from Order Service
- Order status updates
- Payment capture
- Payment refund
- Automatic PAID/REFUNDED order status
- Automatic order/payment/refund notifications
- Notification inbox and mark-as-read
- Analytics summary
- Revenue, order count, AOV, low-stock count and order status breakdown
- Persist analytics snapshots
- Health endpoint for all seven services
- Responsive light-theme UI

# 1. Install prerequisites (Ubuntu / WSL)

```bash
sudo apt update

sudo apt install -y \
  postgresql postgresql-contrib \
  openjdk-21-jdk maven \
  golang-go \
  python3 python3-venv python3-pip \
  ruby-full build-essential libpq-dev \
  php-cli php-pgsql php-curl \
  curl git
```

Install Node.js 22 if required:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Install .NET 8 SDK:

```bash
sudo apt install -y dotnet-sdk-8.0
```

If your Ubuntu release does not expose `dotnet-sdk-8.0` directly, install .NET 8 SDK from Microsoft's Ubuntu package repository, then continue.

Verify:

```bash
java -version
mvn -version
go version
python3 --version
node --version
npm --version
dotnet --version
ruby --version
php --version
psql --version
```

# 2. Start PostgreSQL

```bash
sudo systemctl enable --now postgresql
```

If your WSL installation does not use systemd:

```bash
sudo service postgresql start
```

# 3. Create all databases

From the project root:

```bash
sudo -u postgres psql -f database/bootstrap.sql
```

This creates:

```text
PostgreSQL user: microapp
Password:        microapp123

auth_db
catalog_db
inventory_db
order_db
payment_db
notification_db
analytics_db
```

Verify:

```bash
sudo -u postgres psql -c "\l"
```

Test normal TCP login:

```bash
psql -h 127.0.0.1 -U microapp -d catalog_db
```

Password:

```text
microapp123
```

Then:

```sql
\q
```

# 4. Install application dependencies

Run these once.

## Java Auth

```bash
cd services/auth-service
mvn clean package -DskipTests
cd ../..
```

## Go Catalog

```bash
cd services/catalog-service
go mod tidy
cd ../..
```

## Node Inventory

```bash
cd services/inventory-service
npm install
cd ../..
```

## Python Orders

```bash
cd services/order-service
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
deactivate
cd ../..
```

## C# Payments

```bash
cd services/payment-service
dotnet restore
cd ../..
```

## Ruby Notifications

```bash
cd services/notification-service

export GEM_HOME="$HOME/.local/share/gem/ruby/3.3.0"
export GEM_PATH="$GEM_HOME"
export PATH="$GEM_HOME/bin:$PATH"

gem install bundler

bundle config set --local path "$HOME/.bundle"
bundle install

cd ../..

echo 'export GEM_HOME="$HOME/.local/share/gem/ruby/3.3.0"' >> ~/.bashrc
echo 'export GEM_PATH="$GEM_HOME"' >> ~/.bashrc
echo 'export PATH="$GEM_HOME/bin:$PATH"' >> ~/.bashrc

source ~/.bashrc
```

## PHP Analytics

No Composer packages are needed.

Check PHP extensions:

```bash
php -m | grep -E "pdo_pgsql|curl"
```

## React frontend

```bash
cd frontend
npm install
cd ..
```

# 5. Start the services

Use separate terminals.

## Terminal 1 — Auth / Java — 8081

```bash
cd services/auth-service
mvn spring-boot:run
```

Health:

```bash
curl http://localhost:8081/health
```

Demo account:

```text
admin@devopsshack.com
admin123
```

## Terminal 2 — Catalog / Go — 8082

```bash
cd services/catalog-service
go run .
```

Health:

```bash
curl http://localhost:8082/health
```

Products:

```bash
curl http://localhost:8082/products
```

## Terminal 3 — Inventory / Node.js — 8083

```bash
cd services/inventory-service
npm start
```

Health:

```bash
curl http://localhost:8083/health
```

Inventory:

```bash
curl http://localhost:8083/inventory
```

## Terminal 4 — Notification / Ruby — 8086

Start this before Orders and Payments because those services call it.

```bash
cd services/notification-service
bundle exec ruby app.rb
```

Health:

```bash
curl http://localhost:8086/health
```

## Terminal 5 — Orders / Python — 8084

```bash
cd services/order-service
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8084 --reload
```

Health:

```bash
curl http://localhost:8084/health
```

Swagger:

```text
http://localhost:8084/docs
```

## Terminal 6 — Payments / C# — 8085

```bash
cd services/payment-service
dotnet run
```

Health:

```bash
curl http://localhost:8085/health
```

## Terminal 7 — Analytics / PHP — 8087

```bash
cd services/analytics-service
php -S 0.0.0.0:8087 router.php
```

Health:

```bash
curl http://localhost:8087/health
```

## Terminal 8 — React UI — 5173

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

Open:

```text
http://localhost:5173
```

# 6. Recommended startup order

```text
PostgreSQL
Auth          :8081
Catalog       :8082
Inventory     :8083
Notification  :8086
Orders        :8084
Payments      :8085
Analytics     :8087
Frontend      :5173
```

# 7. Test the complete flow manually

## Login

```bash
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@devopsshack.com","password":"admin123"}'
```

## View products

```bash
curl http://localhost:8082/products
```

## Check product 1 inventory

```bash
curl http://localhost:8083/inventory/1
```

## Create an order

```bash
curl -X POST http://localhost:8084/orders \
  -H "Content-Type: application/json" \
  -d '{
    "user_email":"admin@devopsshack.com",
    "items":[
      {"product_id":1,"quantity":2},
      {"product_id":2,"quantity":1}
    ]
  }'
```

What happens internally:

```text
Client
  |
  | POST /orders
  v
Order Service
  |
  +--> GET Catalog /products/{id}
  |      obtains authoritative name + price
  |
  +--> POST Inventory /inventory/reserve
  |      reserves all lines inside a DB transaction
  |
  +--> INSERT order_db.orders
  |
  `--> POST Notification /notifications
```

## List orders

```bash
curl http://localhost:8084/orders
```

## Capture payment

Use the exact order total returned by the Order Service.

```bash
curl -X POST http://localhost:8085/payments \
  -H "Content-Type: application/json" \
  -d '{
    "orderId":1,
    "amount":224.48,
    "method":"CARD",
    "recipient":"admin@devopsshack.com"
  }'
```

The Payment Service first validates the authoritative order amount, commits the reserved inventory, persists the payment, changes the order to `PAID`, and sends a notification.

## Refund payment 1

```bash
curl -X POST http://localhost:8085/payments/1/refund
```

## Notifications

```bash
curl "http://localhost:8086/notifications?recipient=admin@devopsshack.com"
```

## Analytics

```bash
curl http://localhost:8087/analytics/summary
```

Save a snapshot in `analytics_db`:

```bash
curl -X POST http://localhost:8087/analytics/snapshot
```

# 8. Important API endpoints

## Auth :8081

```text
GET  /health
POST /auth/register
POST /auth/login
GET  /auth/me?token=<token>
```

## Catalog :8082

```text
GET    /health
GET    /products
GET    /products?q=search-text
GET    /products/{id}
POST   /products
PUT    /products/{id}
DELETE /products/{id}
```

## Inventory :8083

```text
GET  /health
GET  /inventory
GET  /inventory/{productId}
POST /inventory/{productId}/adjust
POST /inventory/reserve
POST /inventory/release
POST /inventory/commit
POST /inventory/return
```

## Orders :8084

```text
GET  /health
GET  /orders
GET  /orders/{id}
POST /orders
PUT  /orders/{id}/status
```

## Payments :8085

```text
GET  /health
GET  /payments
POST /payments
POST /payments/{id}/refund
```

## Notifications :8086

```text
GET  /health
GET  /notifications
POST /notifications
POST /notifications/{id}/read
```

## Analytics :8087

```text
GET  /health
GET  /analytics/summary
GET  /analytics/snapshots
POST /analytics/snapshot
```

# 9. Inspect each database

Example:

```bash
psql -h 127.0.0.1 -U microapp -d order_db
```

Then:

```sql
\dt
SELECT * FROM orders;
\q
```

Other databases:

```bash
psql -h 127.0.0.1 -U microapp -d auth_db
psql -h 127.0.0.1 -U microapp -d catalog_db
psql -h 127.0.0.1 -U microapp -d inventory_db
psql -h 127.0.0.1 -U microapp -d payment_db
psql -h 127.0.0.1 -U microapp -d notification_db
psql -h 127.0.0.1 -U microapp -d analytics_db
```

# 10. Why this is truly microservice-based

The services do not query each other's databases.

For example, the Python Order Service does **not** run SQL against `catalog_db` or `inventory_db`.

It uses:

```text
GET  http://localhost:8082/products/1
POST http://localhost:8083/inventory/reserve
```

So the boundary is:

```text
Order Service -> HTTP -> Inventory Service -> inventory_db
```

not:

```text
Order Service ---------------------------> inventory_db
```

Each backend service:

- starts as a separate operating-system process,
- has its own port,
- has its own runtime/language,
- owns its own database,
- exposes its own API,
- can be restarted independently,
- communicates through the network.

# 11. Health check

Once everything is running:

```bash
bash scripts/health-check.sh
```

# 12. Optional one-command start

After dependencies are installed:

```bash
bash scripts/start-all.sh
```

Stop:

```bash
bash scripts/stop-all.sh
```

Logs:

```text
logs/
```

# 13. Troubleshooting

## PostgreSQL connection refused

```bash
sudo service postgresql status
sudo service postgresql start
ss -lntp | grep 5432
```

## A backend port is down

```bash
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8083/health
curl http://localhost:8084/health
curl http://localhost:8085/health
curl http://localhost:8086/health
curl http://localhost:8087/health
```

## Reset databases

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS auth_db;"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS catalog_db;"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS inventory_db;"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS order_db;"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS payment_db;"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS notification_db;"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS analytics_db;"

sudo -u postgres psql -f database/bootstrap.sql
```

# 14. Production extensions to teach later

This local project intentionally keeps infrastructure light. A production version would normally add:

- API Gateway
- OIDC/OAuth2 identity provider
- service-to-service authentication
- message broker such as Kafka/RabbitMQ
- retries, circuit breakers and idempotency
- distributed tracing
- centralized logs
- secret manager
- database migration tooling
- TLS
- Kubernetes
- CI/CD
- autoscaling
- contract tests
