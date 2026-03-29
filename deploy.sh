#!/usr/bin/env bash
# ─── FlowForge VPS Deployment Script ─────────────────────────────────────────
# Usage: bash deploy.sh
# Tested on: Ubuntu 22.04 LTS
# Requirements: Run as root on a fresh VPS
# Domains: stackless.cloud (frontend), api.stackless.cloud (backend)
set -euo pipefail

# ─── Error trap ───────────────────────────────────────────────────────────────
trap 'echo -e "\n${RED}[ERROR]${NC} Deployment failed at line $LINENO. Check output above.\nTo check container logs: docker compose -f ${COMPOSE_FILE:-docker-compose.prod.yml} logs\nTo stop containers: docker compose -f ${COMPOSE_FILE:-docker-compose.prod.yml} down" >&2' ERR

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════${NC}"; echo -e "${BOLD} $1${NC}"; echo -e "${BOLD}${BLUE}══════════════════════════════════════${NC}\n"; }

# ─── Variables ────────────────────────────────────────────────────────────────
FRONTEND_DOMAIN="stackless.cloud"
API_DOMAIN="api.stackless.cloud"
APP_DIR="/opt/flowforge"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

# ─── 0. Pre-flight checks ─────────────────────────────────────────────────────
section "Pre-flight checks"

[[ $EUID -ne 0 ]] && error "This script must be run as root. Use: sudo bash deploy.sh"

log "Detecting VPS public IP..."
VPS_IP=$(curl -s --max-time 10 https://api.ipify.org || curl -s --max-time 10 https://ifconfig.me || hostname -I | awk '{print $1}')
log "VPS IP: ${VPS_IP}"

# ─── 1. System update ────────────────────────────────────────────────────────
section "1/9 System update"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git ufw gnupg ca-certificates lsb-release
success "System updated"

# ─── 2. Install Docker CE ─────────────────────────────────────────────────────
section "2/9 Installing Docker CE"

if command -v docker &>/dev/null; then
    warn "Docker already installed: $(docker --version)"
else
    log "Installing Docker CE..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    success "Docker CE installed: $(docker --version)"
fi

# ─── 3. Install Nginx + Certbot ───────────────────────────────────────────────
section "3/9 Installing Nginx + Certbot"

if ! command -v nginx &>/dev/null; then
    apt-get install -y -qq nginx
    systemctl enable nginx
    success "Nginx installed"
else
    warn "Nginx already installed: $(nginx -v 2>&1)"
fi

if ! command -v certbot &>/dev/null; then
    apt-get install -y -qq certbot python3-certbot-nginx
    success "Certbot installed"
else
    warn "Certbot already installed"
fi

# ─── 4. UFW Firewall ─────────────────────────────────────────────────────────
section "4/9 Configuring UFW firewall"

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP"
ufw allow 443/tcp  comment "HTTPS"
ufw --force enable
success "UFW configured: SSH(22), HTTP(80), HTTPS(443) allowed"

# ─── 5. DNS verification ─────────────────────────────────────────────────────
section "5/9 DNS verification"

check_dns() {
    local domain=$1
    local resolved
    resolved=$(getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -1 || true)
    if [[ "$resolved" == "$VPS_IP" ]]; then
        success "$domain → $resolved ✓"
        return 0
    else
        warn "$domain resolves to '$resolved' but VPS IP is '$VPS_IP'"
        return 1
    fi
}

DNS_OK=true
check_dns "$FRONTEND_DOMAIN" || DNS_OK=false
check_dns "$API_DOMAIN"      || DNS_OK=false

if [[ "$DNS_OK" == "false" ]]; then
    warn "DNS not fully propagated. SSL cert generation may fail."
    warn "Make sure both domains point to $VPS_IP in your DNS settings."
    read -rp "Continue anyway? (y/N): " dns_continue
    [[ "$dns_continue" =~ ^[Yy]$ ]] || error "Aborted — fix DNS first then re-run."
fi

# ─── 6. Setup app directory + code ───────────────────────────────────────────
section "6/9 Setting up application"

if [[ ! -d "$APP_DIR" ]]; then
    log "Creating app directory at $APP_DIR"
    mkdir -p "$APP_DIR"
fi

# Check if we're running from the project directory or need to clone
if [[ -f "$(pwd)/docker-compose.prod.yml" ]]; then
    log "Copying project files to $APP_DIR..."
    # Preserve existing .env.production if it exists (don't overwrite production secrets)
    if [[ -f "$APP_DIR/$ENV_FILE" ]]; then
        cp "$APP_DIR/$ENV_FILE" "/tmp/env.production.backup"
        cp -r "$(pwd)/." "$APP_DIR/"
        mv "/tmp/env.production.backup" "$APP_DIR/$ENV_FILE"
        warn "Preserved existing $APP_DIR/$ENV_FILE (protected from overwrite)"
    else
        cp -r "$(pwd)/." "$APP_DIR/"
    fi
    cd "$APP_DIR"
    success "Project files copied to $APP_DIR"
elif [[ -f "$APP_DIR/docker-compose.prod.yml" ]]; then
    cd "$APP_DIR"
    log "Using existing files at $APP_DIR"
else
    error "Cannot find docker-compose.prod.yml. Run this script from the project root directory."
fi

# ─── 7. Environment setup ─────────────────────────────────────────────────────
section "7/9 Environment configuration"

if [[ -f "$ENV_FILE" ]]; then
    warn "$ENV_FILE already exists — skipping interactive setup."
    warn "To reconfigure, delete $ENV_FILE and re-run."
else
    log "Generating secure random passwords..."
    MONGO_PASS=$(openssl rand -hex 24)
    REDIS_PASS=$(openssl rand -hex 24)
    RUSTFS_PASS=$(openssl rand -hex 24)
    SECRET_KEY=$(openssl rand -hex 64)
    CSRF_SECRET=$(openssl rand -hex 32)

    echo ""
    echo -e "${BOLD}Please provide the following values (press Enter to use generated defaults):${NC}"
    echo ""

    read -rp "MongoDB username [admin]: " MONGO_USER
    MONGO_USER=${MONGO_USER:-admin}

    read -rp "MongoDB password [auto-generated]: " MONGO_PASS_INPUT
    MONGO_PASS=${MONGO_PASS_INPUT:-$MONGO_PASS}

    read -rp "Redis password [auto-generated]: " REDIS_PASS_INPUT
    REDIS_PASS=${REDIS_PASS_INPUT:-$REDIS_PASS}

    read -rp "RustFS access key [rustfsadmin]: " RUSTFS_KEY
    RUSTFS_KEY=${RUSTFS_KEY:-rustfsadmin}

    read -rp "RustFS secret [auto-generated]: " RUSTFS_PASS_INPUT
    RUSTFS_PASS=${RUSTFS_PASS_INPUT:-$RUSTFS_PASS}

    read -rp "SMTP host (e.g. smtp.gmail.com) [leave blank to skip]: " SMTP_HOST
    SMTP_USER=""; SMTP_PASS=""
    if [[ -n "$SMTP_HOST" ]]; then
        read -rp "SMTP username: " SMTP_USER
        read -rsp "SMTP password: " SMTP_PASS; echo ""
        read -rp "SMTP port [587]: " SMTP_PORT_INPUT
        SMTP_PORT=${SMTP_PORT_INPUT:-587}
    fi

    read -rp "Admin email for Let's Encrypt notifications [admin@${FRONTEND_DOMAIN}]: " LETSENCRYPT_EMAIL
    LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL:-admin@${FRONTEND_DOMAIN}}

    cat > "$ENV_FILE" <<EOF
# ─── FlowForge Production Environment ────────────────────────────────────────
# Auto-generated by deploy.sh on $(date)

# MongoDB
MONGO_INITDB_ROOT_USERNAME=${MONGO_USER}
MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASS}
MONGODB_DB_NAME=flowforge

# Redis
REDIS_PASSWORD=${REDIS_PASS}

# RustFS
RUSTFS_ACCESS_KEY=${RUSTFS_KEY}
RUSTFS_SECRET_KEY=${RUSTFS_PASS}
RUSTFS_BUCKET_NAME=flowforge-uploads
RUSTFS_USE_SSL=false

# App Security
SECRET_KEY=${SECRET_KEY}
CSRF_SECRET=${CSRF_SECRET}

# App URLs
APP_BASE_URL=https://${FRONTEND_DOMAIN}
CORS_ORIGINS=https://${FRONTEND_DOMAIN}
ENVIRONMENT=production
DEBUG=false

# JWT
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Email
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USERNAME=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASS:-}
SMTP_USE_TLS=true
EMAIL_FROM=FlowForge <noreply@${FRONTEND_DOMAIN}>
BOUNCE_WEBHOOK_SECRET=

# Rate Limiting
RATE_LIMIT_REQUESTS=300
RATE_LIMIT_WINDOW_SECONDS=60

# File Uploads
MAX_UPLOAD_SIZE_MB=25

# AI Builder (API keys are per-tenant, configured in app UI)
AI_SESSION_TTL_DAYS=7

# OAuth (leave empty to disable)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Stripe (leave empty to disable)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=

# Slack
SLACK_DEFAULT_WEBHOOK_URL=

# reCAPTCHA
RECAPTCHA_SECRET_KEY=
RECAPTCHA_SITE_KEY=
EOF

    chmod 600 "$ENV_FILE"
    success "$ENV_FILE created with secure permissions (600)"
fi


# Guard: check for unfilled placeholder values
if grep -q "CHANGE_ME" "$ENV_FILE" 2>/dev/null; then
    error "$ENV_FILE still contains CHANGE_ME placeholders. Please fill in all values before deploying."
fi

# ─── 8. Docker build + start ──────────────────────────────────────────────────
section "8/9 Starting Docker services"

log "Building and starting all containers (this may take 5-10 minutes)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

log "Waiting for backend health check..."
RETRIES=30
until curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    [[ $RETRIES -le 0 ]] && error "Backend failed to start. Check logs: docker compose -f $COMPOSE_FILE logs backend"
    echo -n "."
    sleep 5
done
echo ""
success "Backend is healthy at http://127.0.0.1:8000"

log "Waiting for frontend..."
RETRIES=15
until curl -sf http://127.0.0.1:3000 > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    [[ $RETRIES -le 0 ]] && error "Frontend failed to start. Check logs: docker compose -f $COMPOSE_FILE logs frontend"
    echo -n "."
    sleep 3
done
echo ""
success "Frontend is healthy at http://127.0.0.1:3000"

# ─── 9. Nginx + SSL ───────────────────────────────────────────────────────────
section "9/9 Configuring Nginx + SSL"

# Frontend site config (pre-SSL — Certbot will add SSL block)
cat > /etc/nginx/sites-available/"$FRONTEND_DOMAIN" <<NGINX_EOF
server {
    listen 80;
    server_name ${FRONTEND_DOMAIN} www.${FRONTEND_DOMAIN};

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_EOF

# Backend API site config (pre-SSL)
cat > /etc/nginx/sites-available/"$API_DOMAIN" <<NGINX_EOF
server {
    listen 80;
    server_name ${API_DOMAIN};

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGINX_EOF

# Enable sites
ln -sf /etc/nginx/sites-available/"$FRONTEND_DOMAIN" /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/"$API_DOMAIN" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
success "Nginx configured and reloaded"

# Obtain SSL certificates
# Use saved email or fall back to default
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@${FRONTEND_DOMAIN}}"

log "Obtaining SSL certificates via Let's Encrypt..."
if certbot certificates 2>/dev/null | grep -q "$FRONTEND_DOMAIN"; then
    warn "SSL cert for $FRONTEND_DOMAIN already exists — skipping (will auto-renew)"
else
    certbot --nginx \
        -d "$FRONTEND_DOMAIN" \
        -d "www.$FRONTEND_DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$LETSENCRYPT_EMAIL" \
        --redirect
fi

if certbot certificates 2>/dev/null | grep -q "$API_DOMAIN"; then
    warn "SSL cert for $API_DOMAIN already exists — skipping (will auto-renew)"
else
    certbot --nginx \
        -d "$API_DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$LETSENCRYPT_EMAIL" \
        --redirect
fi

success "SSL certificates obtained"

# Verify auto-renewal
log "Verifying Certbot auto-renewal..."
certbot renew --dry-run
success "Auto-renewal verified"

# Add renewal cron if not already there
(crontab -l 2>/dev/null | grep -q "certbot renew") || \
    { crontab -l 2>/dev/null || true; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'"; } | crontab -
success "Certbot renewal cron job set (runs daily at 3am)"

# ─── Final health check ───────────────────────────────────────────────────────
section "Final verification"

log "Checking https://${FRONTEND_DOMAIN}..."
curl -sf "https://${FRONTEND_DOMAIN}" > /dev/null && success "https://${FRONTEND_DOMAIN} ✓" || warn "Frontend HTTPS check failed"

log "Checking https://${API_DOMAIN}/health..."
curl -sf "https://${API_DOMAIN}/health" > /dev/null && success "https://${API_DOMAIN}/health ✓" || warn "Backend HTTPS check failed"

log "Docker service status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   FlowForge deployed successfully!       ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Frontend:  ${BOLD}https://${FRONTEND_DOMAIN}${NC}"
echo -e "  API:       ${BOLD}https://${API_DOMAIN}${NC}"
echo -e "  API Docs:  ${BOLD}https://${API_DOMAIN}/docs${NC}"
echo ""
echo -e "  Logs:      docker compose -f $COMPOSE_FILE logs -f"
echo -e "  Status:    docker compose -f $COMPOSE_FILE ps"
echo -e "  Restart:   docker compose -f $COMPOSE_FILE restart"
echo ""
echo -e "${YELLOW}  IMPORTANT: Save your .env.production file securely!${NC}"
echo -e "${YELLOW}  Backup:    cp $APP_DIR/.env.production ~/env.production.backup${NC}"
echo ""
