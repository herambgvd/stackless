#!/usr/bin/env bash
# Run this on the server as root:  bash /opt/flowforge/nginx/apply-fix.sh
set -euo pipefail

SITE=/etc/nginx/sites-available/stackless.cloud

echo "==> Backing up $SITE"
cp "$SITE" "${SITE}.bak.$(date +%F-%H%M)"

echo "==> Writing fixed config"
cat > "$SITE" << 'NGINX'
server {
    server_name stackless.cloud www.stackless.cloud;
    client_max_body_size 30M;

    # SSE — no buffering
    location = /api/v1/notifications/stream {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        add_header X-Accel-Buffering no;
        proxy_read_timeout 3600s;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
    }

    # WebSocket realtime
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # SPA frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/stackless.cloud/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/stackless.cloud/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.stackless.cloud) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = stackless.cloud) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name stackless.cloud www.stackless.cloud;
    return 404; # managed by Certbot
}
NGINX

echo "==> Testing nginx config"
nginx -t

echo "==> Reloading nginx"
systemctl reload nginx

echo "==> Verifying fix"
CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://stackless.cloud/api/v1/notifications/stream?token=invalid")
TYPE=$(curl -sk -o /dev/null -w "%{content_type}" "https://stackless.cloud/api/v1/notifications/stream?token=invalid")
echo "SSE endpoint: HTTP $CODE | Content-Type: $TYPE"

if [[ "$TYPE" == *"application/json"* ]]; then
    echo "SUCCESS: SSE and API routing fixed!"
else
    echo "WARNING: Still returning $TYPE — check nginx logs"
fi
