#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
shopt -s nullglob
for pidfile in "$ROOT"/logs/*.pid; do
  pid="$(cat "$pidfile")"
  name="$(basename "$pidfile" .pid)"
  if kill -- "-$pid" 2>/dev/null; then
    echo "Stopped $name (process group $pid)"
  fi
  rm -f "$pidfile"
done
