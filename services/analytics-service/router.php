<?php
declare(strict_types=1);

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$dbDsn = getenv("ANALYTICS_DB_DSN") ?: "pgsql:host=127.0.0.1;port=5432;dbname=analytics_db";
$dbUser = getenv("DB_USER") ?: "microapp";
$dbPassword = getenv("DB_PASSWORD") ?: "microapp123";

$catalogUrl = getenv("CATALOG_URL") ?: "http://localhost:8082";
$inventoryUrl = getenv("INVENTORY_URL") ?: "http://localhost:8083";
$orderUrl = getenv("ORDER_URL") ?: "http://localhost:8084";
$paymentUrl = getenv("PAYMENT_URL") ?: "http://localhost:8085";

function respond(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $pdo = new PDO($dbDsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS analytics_snapshots (
            id BIGSERIAL PRIMARY KEY,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ");
} catch (Throwable $e) {
    respond(500, ["error" => "analytics database connection failed", "detail" => $e->getMessage()]);
}

function apiGet(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_HTTPHEADER => ["Accept: application/json"],
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false || $status >= 400) {
        throw new RuntimeException("API call failed for {$url}: HTTP {$status} {$error}");
    }

    $decoded = json_decode($body, true);
    return is_array($decoded) ? $decoded : [];
}

function buildSummary(string $catalogUrl, string $inventoryUrl, string $orderUrl, string $paymentUrl): array {
    $products = apiGet($catalogUrl . "/products");
    $inventory = apiGet($inventoryUrl . "/inventory");
    $orders = apiGet($orderUrl . "/orders");
    $payments = apiGet($paymentUrl . "/payments");

    $capturedRevenue = 0.0;
    $refunded = 0.0;

    foreach ($payments as $payment) {
        $amount = (float)($payment["amount"] ?? 0);
        if (($payment["status"] ?? "") === "CAPTURED") $capturedRevenue += $amount;
        if (($payment["status"] ?? "") === "REFUNDED") $refunded += $amount;
    }

    $statusBreakdown = [];
    foreach ($orders as $order) {
        $status = $order["status"] ?? "UNKNOWN";
        $statusBreakdown[$status] = ($statusBreakdown[$status] ?? 0) + 1;
    }

    $lowStock = array_values(array_filter(
        $inventory,
        fn($x) => (bool)($x["low_stock"] ?? false)
    ));

    $gross = array_reduce(
        $orders,
        fn($sum, $o) => $sum + (float)($o["total"] ?? 0),
        0.0
    );

    return [
        "generated_at" => gmdate("c"),
        "products" => count($products),
        "orders" => count($orders),
        "payments" => count($payments),
        "captured_revenue" => round($capturedRevenue, 2),
        "refunded_amount" => round($refunded, 2),
        "gross_order_value" => round($gross, 2),
        "average_order_value" => count($orders) ? round($gross / count($orders), 2) : 0,
        "low_stock_count" => count($lowStock),
        "low_stock" => $lowStock,
        "order_status" => $statusBreakdown,
        "languages" => ["Java", "Go", "Node.js", "Python", "C#", "Ruby", "PHP"],
    ];
}

$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
$method = $_SERVER["REQUEST_METHOD"];

if ($path === "/health" && $method === "GET") {
    $pdo->query("SELECT 1");
    respond(200, ["service" => "analytics-service", "status" => "UP", "language" => "PHP"]);
}

if ($path === "/analytics/summary" && $method === "GET") {
    try {
        respond(200, buildSummary($catalogUrl, $inventoryUrl, $orderUrl, $paymentUrl));
    } catch (Throwable $e) {
        respond(503, ["error" => "one or more upstream services are unavailable", "detail" => $e->getMessage()]);
    }
}

if ($path === "/analytics/snapshot" && $method === "POST") {
    try {
        $summary = buildSummary($catalogUrl, $inventoryUrl, $orderUrl, $paymentUrl);
        $stmt = $pdo->prepare(
            "INSERT INTO analytics_snapshots(payload) VALUES(CAST(:payload AS jsonb)) RETURNING id"
        );
        $stmt->execute([":payload" => json_encode($summary)]);
        $id = (int)$stmt->fetchColumn();
        respond(201, ["id" => $id, "summary" => $summary]);
    } catch (Throwable $e) {
        respond(503, ["error" => "could not create snapshot", "detail" => $e->getMessage()]);
    }
}

if ($path === "/analytics/snapshots" && $method === "GET") {
    $rows = $pdo->query(
        "SELECT id,payload,created_at FROM analytics_snapshots ORDER BY id DESC LIMIT 20"
    )->fetchAll(PDO::FETCH_ASSOC);

    $result = array_map(function($row) {
        return [
            "id" => (int)$row["id"],
            "payload" => json_decode($row["payload"], true),
            "created_at" => $row["created_at"],
        ];
    }, $rows);

    respond(200, ["snapshots" => $result]);
}

respond(404, ["error" => "route not found"]);
