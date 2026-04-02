#!/bin/bash
# ── Nginx + SSL setup for Stackless on Hostinger VPS ──────────────────────
# Run this ON the VPS as root:  bash setup-nginx.sh
set -e

echo "==> Installing Nginx and Certbot..."
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Copying Nginx config..."
cp /root/no_code_builder/nginx/stackless.conf /etc/nginx/sites-available/stackless.conf

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Enable our site
ln -sf /etc/nginx/sites-available/stackless.conf /etc/nginx/sites-enabled/stackless.conf

echo "==> Testing Nginx config..."
nginx -t

echo "==> Starting Nginx..."
systemctl enable nginx
systemctl restart nginx

echo ""
echo "==> Nginx is running! Test HTTP access first:"
echo "    curl -I http://stackless.cloud"
echo "    curl -I http://api.stackless.cloud/health"
echo ""
echo "==> Once HTTP works, run SSL setup:"
echo "    certbot --nginx -d stackless.cloud -d www.stackless.cloud -d api.stackless.cloud"
echo ""
echo "==> Certbot will automatically:"
echo "    - Get Let's Encrypt SSL certificates"
echo "    - Update Nginx config for HTTPS"
echo "    - Set up auto-renewal"
