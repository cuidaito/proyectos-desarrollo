#!/bin/sh
# Captura periódica en segundo plano y nginx en primer plano.
(
  while true; do
    python3 /app/collect.py || echo "captura fallida, se reintentará"
    sleep "${INTERVAL_SECONDS:-900}"
  done
) &

exec nginx -g 'daemon off;'
