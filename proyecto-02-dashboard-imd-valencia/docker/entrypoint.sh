#!/bin/sh
# Captura periódica y API en segundo plano; nginx en primer plano.
(
  while true; do
    python3 /app/collect.py || echo "captura fallida, se reintentará"
    sleep "${INTERVAL_SECONDS:-180}"
  done
) &

python3 /app/server.py &

exec nginx -g 'daemon off;'
