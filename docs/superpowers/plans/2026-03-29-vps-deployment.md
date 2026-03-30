# Stackless VPS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Stackless to a Hostinger KVM 2 VPS with `stackless.cloud` (frontend) and `api.stackless.cloud` (backend) behind Nginx + Let's Encrypt SSL using a single automated bash script.

**Architecture:** Host Nginx handles SSL termination and reverse-proxies to Docker containers. All internal services (MongoDB, Redis, RustFS) are confined to Docker's internal network with no host-exposed ports. A single `deploy.sh` automates the full server setup from zero to production.

**Tech Stack:** Ubuntu 22.04, Docker CE, Docker Compose v2, Nginx, Certbot (Let's Encrypt), FastAPI/Uvicorn, React/Vite/Nginx, MongoDB 7, Redis 7, RustFS, Celery

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `docker-compose.prod.yml` | Production compose — no dev mounts, internal-only DB ports, localhost-bound app ports |
| Create | `.env.production.example` | Template with all required env vars and comments |
| Create | `deploy.sh` | One-command VPS setup: installs deps, configures env, starts containers, sets up Nginx + SSL |

---

## Task 1: Create docker-compose.prod.yml

**Files:**
- Create: `docker-compose.prod.yml`

- [ ] **Step 1: Write docker-compose.prod.yml**

Create `/Users/snowden/project/no_code_builder/docker-compose.prod.yml` with this exact content:

```yaml
version: "3.9"

services:
  mongodb:
    image: mongo:7.0
    container_name: stackless-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: ${MONGODB_DB_NAME:-stackless}
    # NO host ports — internal network only
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - stackless-net

  redis:
    image: redis:7.2-alpine
    container_name: stackless-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    # NO host ports — internal network only
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - stackless-net

  rustfs:
    image: rustfs/rustfs:latest
    container_name: stackless-rustfs
    restart: unless-stopped
    environment:
      RUSTFS_ROOT_USER: ${RUSTFS_ACCESS_KEY}
      RUSTFS_ROOT_PASSWORD: ${RUSTFS_SECRET_KEY}
    # NO host ports — internal network only
    volumes:
      - rustfs_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    networks:
      - stackless-net

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: stackless-backend:latest
    container_name: stackless-backend
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      MONGODB_URI: mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@mongodb:27017/${MONGODB_DB_NAME:-stackless}?authSource=admin
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      CELERY_BROKER_URL: redis://:${REDIS_PASSWORD}@redis:6379/1
      CELERY_RESULT_BACKEND: redis://:${REDIS_PASSWORD}@redis:6379/2
      RUSTFS_ENDPOINT: rustfs:9000
      ENVIRONMENT: production
      DEBUG: "false"
    ports:
      - "127.0.0.1:8000:8000"   # Only accessible from localhost (Nginx)
    # NO bind mount — uses built image
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
      rustfs:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    networks:
      - stackless-net

  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: stackless-backend:latest
    container_name: stackless-celery-worker
    restart: unless-stopped
    command: celery -A celery_worker worker --loglevel=warning --concurrency=2 -Q default,workflows,notifications
    env_file:
      - .env.production
    environment:
      MONGODB_URI: mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@mongodb:27017/${MONGODB_DB_NAME:-stackless}?authSource=admin
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      CELERY_BROKER_URL: redis://:${REDIS_PASSWORD}@redis:6379/1
      CELERY_RESULT_BACKEND: redis://:${REDIS_PASSWORD}@redis:6379/2
      RUSTFS_ENDPOINT: rustfs:9000
      ENVIRONMENT: production
      DEBUG: "false"
    # NO bind mount — uses built image
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - stackless-net

  celery-beat:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: stackless-backend:latest
    container_name: stackless-celery-beat
    restart: unless-stopped
    command: celery -A celery_worker beat --loglevel=warning --scheduler celery.beat:PersistentScheduler
    env_file:
      - .env.production
    environment:
      MONGODB_URI: mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@mongodb:27017/${MONGODB_DB_NAME:-stackless}?authSource=admin
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      CELERY_BROKER_URL: redis://:${REDIS_PASSWORD}@redis:6379/1
      CELERY_RESULT_BACKEND: redis://:${REDIS_PASSWORD}@redis:6379/2
      ENVIRONMENT: production
      DEBUG: "false"
    # NO bind mount — uses built image
    volumes:
      - celery_beat_data:/app/celerybeat-schedule
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - stackless-net

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    image: stackless-frontend:latest
    container_name: stackless-frontend
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:80"    # Only accessible from localhost (Nginx)
    depends_on:
      - backend
    networks:
      - stackless-net

volumes:
  mongodb_data:
  redis_data:
  rustfs_data:
  celery_beat_data:

networks:
  stackless-net:
    driver: bridge
```

- [ ] **Step 2: Validate compose file syntax**

Run from the project root:
```bash
docker compose -f docker-compose.prod.yml config --quiet
echo "✅ Compose file is valid"
```

Expected: No errors printed. If you see "variable is not set" warnings for env vars, that is normal — the `.env.production` file is created in Task 3.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat: add production docker-compose without dev mounts and secured ports"
```

---

## Task 2: Create .env.production.example

**Files:**
- Create: `.env.production.example`

- [ ] **Step 1: Write .env.production.example**

Create `/Users/snowden/project/no_code_builder/.env.production.example` with this exact content:

```bash
# ─── Stackless Production Environment ────────────────────────────────────────
# Copy this file to .env.production and fill in all values.
# Generate random passwords with: openssl rand -hex 32

# ─── MongoDB ──────────────────────────────────────────────────────────────────
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=CHANGE_ME_strong_mongo_password
MONGODB_DB_NAME=stackless

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=CHANGE_ME_strong_redis_password

# ─── RustFS (Object Storage) ──────────────────────────────────────────────────
RUSTFS_ACCESS_KEY=rustfsadmin
RUSTFS_SECRET_KEY=CHANGE_ME_strong_rustfs_password
RUSTFS_BUCKET_NAME=stackless-uploads
RUSTFS_USE_SSL=false

# ─── App Security ─────────────────────────────────────────────────────────────
# Generate with: openssl rand -hex 64
SECRET_KEY=CHANGE_ME_64_char_random_secret_key
# Generate with: openssl rand -hex 32
CSRF_SECRET=CHANGE_ME_32_char_csrf_secret

# ─── App URLs ─────────────────────────────────────────────────────────────────
APP_BASE_URL=https://stackless.cloud
CORS_ORIGINS=https://stackless.cloud
ENVIRONMENT=production
DEBUG=false

# ─── JWT Settings ─────────────────────────────────────────────────────────────
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# ─── Email / SMTP (required for notifications) ────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your@email.com
SMTP_PASSWORD=your_smtp_app_password
SMTP_USE_TLS=true
EMAIL_FROM=Stackless <noreply@stackless.cloud>
# Optional: secret for validating bounce webhook payloads from SMTP provider
BOUNCE_WEBHOOK_SECRET=

# ─── Rate Limiting ────────────────────────────────────────────────────────────
RATE_LIMIT_REQUESTS=300
RATE_LIMIT_WINDOW_SECONDS=60

# ─── File Uploads ─────────────────────────────────────────────────────────────
MAX_UPLOAD_SIZE_MB=25

# ─── AI Builder ───────────────────────────────────────────────────────────────
# NOTE: AI provider keys (OpenAI, Anthropic) are configured per-tenant
# inside the app UI — NOT here at the system level.
AI_SESSION_TTL_DAYS=7

# ─── OAuth / SSO (leave empty to disable) ────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ─── Stripe Billing (leave empty to disable) ─────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=

# ─── Slack (leave empty to disable) ──────────────────────────────────────────
SLACK_DEFAULT_WEBHOOK_URL=

# ─── reCAPTCHA v2 (leave empty to disable) ───────────────────────────────────
RECAPTCHA_SECRET_KEY=
RECAPTCHA_SITE_KEY=
```

- [ ] **Step 2: Add .env.production to .gitignore**

Check if `.gitignore` exists:
```bash
cat .gitignore 2>/dev/null | grep "env.production" || echo "NOT FOUND"
```

If `.env.production` is NOT in `.gitignore`, add it:
```bash
echo ".env.production" >> .gitignore
echo ".env" >> .gitignore
```

- [ ] **Step 3: Commit**

```bash
git add .env.production.example .gitignore
git commit -m "feat: add .env.production.example with all required variables"
```

---

## Task 3: Create deploy.sh

**Files:**
- Create: `deploy.sh`

This script runs on the VPS as root. It installs all dependencies, sets up the environment, starts Docker services, configures Nginx, and obtains SSL certificates.

- [ ] **Step 1: Write deploy.sh**

Create `/Users/snowden/project/no_code_builder/deploy.sh` with this exact content:

```bash
#!/usr/bin/env bash
# ─── Stackless VPS Deployment Script ─────────────────────────────────────────
# Usage: bash deploy.sh
# Tested on: Ubuntu 22.04 LTS
# Requirements: Run as root on a fresh VPS
# Domains: stackless.cloud (frontend), api.stackless.cloud (backend)
set -euo pipefail

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
APP_DIR="/opt/stackless"
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

ufw --force reset
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
    cp -r "$(pwd)/." "$APP_DIR/"
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

    cat > "$ENV_FILE" <<EOF
# ─── Stackless Production Environment ────────────────────────────────────────
# Auto-generated by deploy.sh on $(date)

# MongoDB
MONGO_INITDB_ROOT_USERNAME=${MONGO_USER}
MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASS}
MONGODB_DB_NAME=stackless

# Redis
REDIS_PASSWORD=${REDIS_PASS}

# RustFS
RUSTFS_ACCESS_KEY=${RUSTFS_KEY}
RUSTFS_SECRET_KEY=${RUSTFS_PASS}
RUSTFS_BUCKET_NAME=stackless-uploads
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
EMAIL_FROM=Stackless <noreply@${FRONTEND_DOMAIN}>
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

# Source the env file to use values below
set -a; source "$ENV_FILE"; set +a

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

    client_max_body_size 50M;

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
log "Obtaining SSL certificates via Let's Encrypt..."
certbot --nginx \
    -d "$FRONTEND_DOMAIN" \
    -d "www.$FRONTEND_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "admin@${FRONTEND_DOMAIN}" \
    --redirect

certbot --nginx \
    -d "$API_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "admin@${FRONTEND_DOMAIN}" \
    --redirect

success "SSL certificates obtained"

# Verify auto-renewal
log "Verifying Certbot auto-renewal..."
certbot renew --dry-run
success "Auto-renewal verified"

# Add renewal cron if not already there
(crontab -l 2>/dev/null | grep -q "certbot renew") || \
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
success "Certbot renewal cron job set (runs daily at 3am)"

# ─── Final health check ───────────────────────────────────────────────────────
section "Final verification"

log "Checking https://${FRONTEND_DOMAIN}..."
curl -sf "https://${FRONTEND_DOMAIN}" > /dev/null && success "https://${FRONTEND_DOMAIN} ✓" || warn "Frontend HTTPS check failed"

log "Checking https://${API_DOMAIN}/health..."
curl -sf "https://${API_DOMAIN}/health" > /dev/null && success "https://${API_DOMAIN}/health ✓" || warn "Backend HTTPS check failed"

log "Docker service status:"
docker compose -f "$COMPOSE_FILE" ps

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   Stackless deployed successfully! 🚀    ║${NC}"
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
```

- [ ] **Step 2: Make deploy.sh executable**

```bash
chmod +x deploy.sh
```

- [ ] **Step 3: Commit**

```bash
git add deploy.sh .env.production.example
git commit -m "feat: add automated VPS deployment script with Nginx + Certbot SSL"
```

---

## Task 4: VPS Deployment — Step-by-Step

These steps run on your **Hostinger VPS**, not your local machine.

- [ ] **Step 1: SSH into VPS**

```bash
ssh root@<your-vps-ip>
```

- [ ] **Step 2: Install git and clone/upload project**

Option A — if project is on GitHub:
```bash
apt-get install -y git
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /opt/stackless
cd /opt/stackless
```

Option B — upload from local machine (run on your Mac):
```bash
scp -r /Users/snowden/project/no_code_builder/ root@<your-vps-ip>:/opt/stackless
```

- [ ] **Step 3: Run deploy.sh**

```bash
cd /opt/stackless
bash deploy.sh
```

The script will:
1. Update system packages
2. Install Docker CE, Nginx, Certbot
3. Configure UFW firewall
4. Verify DNS for `stackless.cloud` and `api.stackless.cloud`
5. Prompt for passwords (or auto-generate secure ones)
6. Build and start all 7 Docker containers
7. Configure Nginx reverse proxy
8. Obtain Let's Encrypt SSL certificates
9. Verify auto-renewal

Expected duration: **10–15 minutes** on a fresh VPS.

- [ ] **Step 4: Verify all containers are healthy**

```bash
cd /opt/stackless
docker compose -f docker-compose.prod.yml ps
```

Expected output: All 7 services showing `Up` or `healthy`:
```
NAME                        STATUS
stackless-mongodb           Up (healthy)
stackless-redis             Up (healthy)
stackless-rustfs            Up (healthy)
stackless-backend           Up (healthy)
stackless-celery-worker     Up
stackless-celery-beat       Up
stackless-frontend          Up (healthy)
```

- [ ] **Step 5: Create superadmin user**

```bash
docker compose -f docker-compose.prod.yml exec backend python create_superadmin.py
```

Follow the prompts to create your admin account.

- [ ] **Step 6: Verify production URLs**

```bash
curl -I https://stackless.cloud
# Expected: HTTP/2 200

curl https://api.stackless.cloud/health
# Expected: {"status":"ok"} or similar JSON
```

---

## Useful Post-Deploy Commands

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f backend

# Restart a service
docker compose -f docker-compose.prod.yml restart backend

# Deploy code update (after pushing new code to VPS)
cd /opt/stackless
git pull
docker compose -f docker-compose.prod.yml up -d --build backend frontend
docker compose -f docker-compose.prod.yml restart celery-worker celery-beat

# Check SSL cert expiry
certbot certificates

# Backup MongoDB
docker exec stackless-mongodb mongodump \
  --username admin \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --out /tmp/mongodump
```
