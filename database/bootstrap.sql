\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='microapp') THEN
    CREATE ROLE microapp LOGIN PASSWORD 'microapp123';
  ELSE
    ALTER ROLE microapp WITH LOGIN PASSWORD 'microapp123';
  END IF;
END
$$;

SELECT 'CREATE DATABASE auth_db OWNER microapp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='auth_db')\gexec

SELECT 'CREATE DATABASE catalog_db OWNER microapp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='catalog_db')\gexec

SELECT 'CREATE DATABASE inventory_db OWNER microapp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='inventory_db')\gexec

SELECT 'CREATE DATABASE order_db OWNER microapp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='order_db')\gexec

SELECT 'CREATE DATABASE payment_db OWNER microapp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='payment_db')\gexec

SELECT 'CREATE DATABASE notification_db OWNER microapp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='notification_db')\gexec

SELECT 'CREATE DATABASE analytics_db OWNER microapp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='analytics_db')\gexec
