#!/bin/sh
# Captura periódica en segundo plano y API en primer plano.
(
  while true; do
    python3 /app/collect.py || echo "captura fallida, se reintentará"
    sleep "${INTERVAL_SECONDS:-180}"
  done
) &

exec python3 /app/server.py
