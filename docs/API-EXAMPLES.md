# Extra API examples

## Create a product

```bash
curl -X POST http://localhost:8082/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Platform Engineering Mug","category":"Workspace","description":"Demo item","price":16.50,"image":"☕"}'
```

If the new product is id 7:

```bash
curl -X POST http://localhost:8083/inventory/7/adjust \
  -H "Content-Type: application/json" \
  -d '{"delta":40}'
```

## Manually reserve inventory

```bash
curl -X POST http://localhost:8083/inventory/reserve \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":1,"quantity":2}]}'
```

## Send a notification

```bash
curl -X POST http://localhost:8086/notifications \
  -H "Content-Type: application/json" \
  -d '{"recipient":"admin@devopsshack.com","type":"INFO","subject":"Manual notification","message":"Notification service works."}'
```
