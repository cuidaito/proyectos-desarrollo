FROM nginx:alpine

RUN apk add --no-cache python3 tzdata

COPY index.html styles.css config.js script.js /usr/share/nginx/html/
COPY scripts/collect.py scripts/server.py /app/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh && mkdir -p /usr/share/nginx/html/data

ENV DATA_DIR=/usr/share/nginx/html/data \
    INTERVAL_SECONDS=180 \
    TZ=Europe/Madrid

VOLUME /usr/share/nginx/html/data
EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
