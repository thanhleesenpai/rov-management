#!/bin/sh
set -e

REAL_CERT="/etc/letsencrypt/live/rov-management.thanhminhle.id.vn/fullchain.pem"

if [ -f "$REAL_CERT" ]; then
    echo "[Nginx Entrypoint] Using real Let's Encrypt SSL certificates from host..."
else
    echo "[Nginx Entrypoint] SSL certs not found on host. Switching to fallback self-signed certificates for local testing..."
    sed -i 's|/etc/letsencrypt/live/rov-management.thanhminhle.id.vn/|/etc/nginx/certs/|g' /etc/nginx/nginx.conf
fi

exec nginx -g "daemon off;"
