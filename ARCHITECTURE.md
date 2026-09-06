# Architecture Summary

```text
                         React UI :5173
                              |
   +----------+----------+----------+----------+----------+
   |          |          |          |          |          |
 Auth      Catalog    Inventory   Orders    Payments   Notifications
 Java       Go        Node.js     Python      C#          Ruby
:8081      :8082      :8083      :8084      :8085       :8086
   |          |          |          |          |           |
auth_db  catalog_db inventory_db order_db payment_db notification_db

                         Analytics :8087
                              PHP
                               |
                         analytics_db
                               |
                 REST aggregation from service APIs
```

The Order Service calls Catalog and Inventory.
The Payment Service calls Orders.
Orders and Payments call Notifications.
Analytics calls Catalog, Inventory, Orders and Payments.
