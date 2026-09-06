using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});
builder.Services.AddHttpClient();

var app = builder.Build();
app.UseCors();

var connectionString =
    Environment.GetEnvironmentVariable("PAYMENT_DB_URL")
    ?? "Host=127.0.0.1;Port=5432;Database=payment_db;Username=microapp;Password=microapp123";

var orderUrl = Environment.GetEnvironmentVariable("ORDER_URL") ?? "http://localhost:8084";
var inventoryUrl = Environment.GetEnvironmentVariable("INVENTORY_URL") ?? "http://localhost:8083";
var notificationUrl = Environment.GetEnvironmentVariable("NOTIFICATION_URL") ?? "http://localhost:8086";
var dataSource = NpgsqlDataSource.Create(connectionString);

await using (var conn = await dataSource.OpenConnectionAsync())
await using (var cmd = new NpgsqlCommand("""
    CREATE TABLE IF NOT EXISTS payments (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
        method VARCHAR(40) NOT NULL,
        status VARCHAR(40) NOT NULL,
        transaction_ref VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        refunded_at TIMESTAMPTZ NULL
    )
    """, conn))
{
    await cmd.ExecuteNonQueryAsync();
}

app.MapGet("/health", async () =>
{
    await using var conn = await dataSource.OpenConnectionAsync();
    await using var cmd = new NpgsqlCommand("SELECT 1", conn);
    await cmd.ExecuteScalarAsync();
    return Results.Ok(new { service = "payment-service", status = "UP", language = "C#" });
});

app.MapGet("/payments", async () =>
{
    var result = new List<object>();
    await using var conn = await dataSource.OpenConnectionAsync();
    await using var cmd = new NpgsqlCommand("""
        SELECT id,order_id,amount,method,status,transaction_ref,created_at,refunded_at
        FROM payments ORDER BY id DESC
        """, conn);
    await using var reader = await cmd.ExecuteReaderAsync();

    while (await reader.ReadAsync())
    {
        result.Add(new
        {
            id = reader.GetInt64(0),
            orderId = reader.GetInt64(1),
            amount = reader.GetDecimal(2),
            method = reader.GetString(3),
            status = reader.GetString(4),
            transactionRef = reader.GetString(5),
            createdAt = reader.GetDateTime(6),
            refundedAt = reader.IsDBNull(7) ? (DateTime?)null : reader.GetDateTime(7)
        });
    }
    return Results.Ok(result);
});

app.MapPost("/payments", async (PaymentCreate input, IHttpClientFactory factory) =>
{
    if (input.OrderId <= 0 || input.Amount <= 0)
        return Results.BadRequest(new { error = "orderId and positive amount are required" });

    var method = (input.Method ?? "CARD").ToUpperInvariant();
    if (method is not ("CARD" or "UPI" or "NETBANKING"))
        return Results.BadRequest(new { error = "method must be CARD, UPI or NETBANKING" });

    var client = factory.CreateClient();

    var orderResponse = await client.GetAsync($"{orderUrl}/orders/{input.OrderId}");
    if (!orderResponse.IsSuccessStatusCode)
        return Results.BadRequest(new { error = "order does not exist or Order Service is unavailable" });

    var order = await orderResponse.Content.ReadFromJsonAsync<JsonElement>();
    var orderTotal = order.GetProperty("total").GetDecimal();
    var orderStatus = order.GetProperty("status").GetString() ?? "";

    if (orderStatus != "CREATED")
        return Results.Conflict(new { error = $"order must be CREATED before payment; current status={orderStatus}" });

    if (decimal.Round(orderTotal, 2) != decimal.Round(input.Amount, 2))
        return Results.BadRequest(new { error = $"payment amount must equal authoritative order total {orderTotal:0.00}" });

    var orderRecipient = order.GetProperty("user_email").GetString() ?? "admin@devopsshack.com";
    var items = order.GetProperty("items")
        .EnumerateArray()
        .Select(x => new InventoryItem(
            x.GetProperty("product_id").GetInt64(),
            x.GetProperty("quantity").GetInt32()
        ))
        .ToList();

    await using var conn = await dataSource.OpenConnectionAsync();

    await using (var existsCmd = new NpgsqlCommand(
        "SELECT COUNT(*) FROM payments WHERE order_id=@orderId AND status='CAPTURED'", conn))
    {
        existsCmd.Parameters.AddWithValue("orderId", input.OrderId);
        var exists = Convert.ToInt64(await existsCmd.ExecuteScalarAsync());
        if (exists > 0)
            return Results.Conflict(new { error = "order already has a captured payment" });
    }

    var commit = await client.PostAsJsonAsync(
        $"{inventoryUrl}/inventory/commit",
        new { items = items.Select(x => new { productId = x.ProductId, quantity = x.Quantity }) }
    );
    if (!commit.IsSuccessStatusCode)
        return Results.Conflict(new { error = "could not commit reserved inventory; payment was not captured" });

    var transactionRef =
        $"TXN-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..8].ToUpper()}";

    long paymentId;
    try
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO payments(order_id,amount,method,status,transaction_ref)
            VALUES(@orderId,@amount,@method,'CAPTURED',@ref)
            RETURNING id
            """, conn);
        cmd.Parameters.AddWithValue("orderId", input.OrderId);
        cmd.Parameters.AddWithValue("amount", input.Amount);
        cmd.Parameters.AddWithValue("method", method);
        cmd.Parameters.AddWithValue("ref", transactionRef);
        paymentId = Convert.ToInt64(await cmd.ExecuteScalarAsync());
    }
    catch
    {
        await client.PostAsJsonAsync(
            $"{inventoryUrl}/inventory/return",
            new { items = items.Select(x => new { productId = x.ProductId, quantity = x.Quantity }) }
        );
        throw;
    }

    try
    {
        await client.PutAsJsonAsync(
            $"{orderUrl}/orders/{input.OrderId}/status",
            new { status = "PAID" }
        );
    }
    catch { }

    try
    {
        await client.PostAsJsonAsync(
            $"{notificationUrl}/notifications",
            new
            {
                recipient = input.Recipient ?? orderRecipient,
                type = "PAYMENT",
                subject = $"Payment captured for order #{input.OrderId}",
                message = $"Payment ${input.Amount:0.00} captured successfully. Ref: {transactionRef}"
            }
        );
    }
    catch { }

    return Results.Created(
        $"/payments/{paymentId}",
        new
        {
            id = paymentId,
            orderId = input.OrderId,
            amount = input.Amount,
            method,
            status = "CAPTURED",
            transactionRef
        }
    );
});

app.MapPost("/payments/{id:long}/refund", async (long id, IHttpClientFactory factory) =>
{
    await using var conn = await dataSource.OpenConnectionAsync();

    long orderId;
    decimal amount;
    string status;

    await using (var get = new NpgsqlCommand(
        "SELECT order_id,amount,status FROM payments WHERE id=@id", conn))
    {
        get.Parameters.AddWithValue("id", id);
        await using var reader = await get.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return Results.NotFound(new { error = "payment not found" });

        orderId = reader.GetInt64(0);
        amount = reader.GetDecimal(1);
        status = reader.GetString(2);
    }

    if (status == "REFUNDED")
        return Results.Conflict(new { error = "payment already refunded" });

    var client = factory.CreateClient();
    var orderResponse = await client.GetAsync($"{orderUrl}/orders/{orderId}");
    if (!orderResponse.IsSuccessStatusCode)
        return Results.Conflict(new { error = "could not load order for refund" });

    var order = await orderResponse.Content.ReadFromJsonAsync<JsonElement>();
    var orderRecipient = order.GetProperty("user_email").GetString() ?? "admin@devopsshack.com";
    var items = order.GetProperty("items")
        .EnumerateArray()
        .Select(x => new InventoryItem(
            x.GetProperty("product_id").GetInt64(),
            x.GetProperty("quantity").GetInt32()
        ))
        .ToList();

    var restock = await client.PostAsJsonAsync(
        $"{inventoryUrl}/inventory/return",
        new { items = items.Select(x => new { productId = x.ProductId, quantity = x.Quantity }) }
    );
    if (!restock.IsSuccessStatusCode)
        return Results.Conflict(new { error = "inventory could not be returned; refund was not completed" });

    await using (var update = new NpgsqlCommand(
        "UPDATE payments SET status='REFUNDED',refunded_at=NOW() WHERE id=@id", conn))
    {
        update.Parameters.AddWithValue("id", id);
        await update.ExecuteNonQueryAsync();
    }

    try
    {
        await client.PutAsJsonAsync(
            $"{orderUrl}/orders/{orderId}/status",
            new { status = "REFUNDED" }
        );
    }
    catch { }

    try
    {
        await client.PostAsJsonAsync(
            $"{notificationUrl}/notifications",
            new
            {
                recipient = orderRecipient,
                type = "REFUND",
                subject = $"Payment refunded for order #{orderId}",
                message = $"Refund of ${amount:0.00} completed for payment #{id}."
            }
        );
    }
    catch { }

    return Results.Ok(new { id, orderId, amount, status = "REFUNDED" });
});

app.Run("http://0.0.0.0:8085");

record PaymentCreate(long OrderId, decimal Amount, string? Method, string? Recipient);
record InventoryItem(long ProductId, int Quantity);
