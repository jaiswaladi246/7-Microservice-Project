#!/usr/bin/env bash
set -u
for entry in "auth:8081" "catalog:8082" "inventory:8083" "orders:8084" "payments:8085" "notifications:8086" "analytics:8087"; do
  name="${entry%%:*}"; port="${entry##*:}"
  printf "%-16s " "$name"
  if curl -fsS "http://localhost:${port}/health" >/dev/null; then
    echo "UP (:${port})"
  else
    echo "DOWN (:${port})"
  fi
done
