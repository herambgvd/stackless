# Stackless VPS Deployment Design
**Date:** 2026-03-29
**Target:** Hostinger KVM 2 VPS (8GB RAM, 2 CPU, 100GB storage)
**Domains:** `stackless.cloud` (frontend), `api.stackless.cloud` (backend)
**Approach:** Host Nginx + Certbot SSL + Docker Compose (production)

---

## 1. Infrastructure Architecture

```
Internet
    │
    ▼
[Hostinger VPS - Ubuntu 22.04]
    │
    ├── Nginx (host, port 80/443)
    │       ├── stackless.cloud       ──► frontend container (127.0.0.1:3000)
    │       └── api.stackless.cloud  ──► backend container  (127.0.0.1:8000)
    │
    └── Docker Internal Network (stackless-net)
            ├── frontend      → 127.0.0.1:3000  (Nginx serves React SPA)
            ├── backend       → 127.0.0.1:8000  (FastAPI/Uvicorn)
            ├── celery-worker   (no host port)
            ├── celery-beat     (no host port)
            ├── mongodb         (no host port — internal only)
            ├── redis           (no host port — internal only)
            └── rustfs          (no host port — internal only)
```

- All internal services (MongoDB, Redis, RustFS) are NOT exposed to the host network
- Backend and frontend bind only to `127.0.0.1` — unreachable from outside except via Nginx
- Dev bind mounts removed — production containers use built Docker images

---

## 2. Files to Create

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | Production docker-compose (no dev mounts, no exposed internal ports) |
| `.env.production.example` | Template for all required environment variables |
| `deploy.sh` | One-command automated deployment script |
| `/etc/nginx/sites-available/stackless.cloud` | Nginx config for frontend |
| `/etc/nginx/sites-available/api.stackless.cloud` | Nginx config for backend API |

---

## 3. docker-compose.prod.yml Changes vs Dev

| Concern | Dev | Production |
|---------|-----|------------|
| Backend code | `./backend:/app` bind mount | Built Docker image only |
| MongoDB port | `27017:27017` exposed | No host port |
| Redis port | `6379:6379` exposed | No host port |
| RustFS ports | `9000:9001` exposed | No host port |
| Backend port | `8000:8000` | `127.0.0.1:8000:8000` |
| Frontend port | `80:80` | `127.0.0.1:3000:80` |
| Celery concurrency | 4 | 2 (fits 2-core VPS) |
| Celery log level | info | warning |

---

## 4. Nginx Configuration

### stackless.cloud (Frontend)
- HTTP (80) → redirect to HTTPS (443)
- HTTPS (443) → proxy to `127.0.0.1:3000`
- SSL managed by Certbot (Let's Encrypt)
- Headers: X-Real-IP, X-Forwarded-Proto

### api.stackless.cloud (Backend)
- HTTP (80) → redirect to HTTPS (443)
- HTTPS (443) → proxy to `127.0.0.1:8000`
- `client_max_body_size 50M` for file uploads
- WebSocket support at `/ws` (`Upgrade` + `Connection` headers)
- SSL managed by Certbot (Let's Encrypt)

---

## 5. Environment Variables (.env.production)

Required secrets:
```
# MongoDB
MONGO_INITDB_ROOT_USERNAME=
MONGO_INITDB_ROOT_PASSWORD=       # strong random password

# Redis
REDIS_PASSWORD=                    # strong random password

# RustFS (object storage)
RUSTFS_ACCESS_KEY=
RUSTFS_SECRET_KEY=                 # strong random password

# App
SECRET_KEY=                        # JWT signing secret (64 char random)
FRONTEND_URL=https://stackless.cloud
BACKEND_URL=https://api.stackless.cloud
ALLOWED_ORIGINS=https://stackless.cloud

# AI Provider Keys — NOT here, configured per-tenant in the app UI
# Tenants add their own OpenAI/Anthropic keys via the tenant settings

# MongoDB DB name
MONGODB_DB_NAME=stackless

# Email (optional, for notifications)
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
```

---

## 6. deploy.sh Script — Step-by-Step Flow

```
bash deploy.sh
```

1. **System update** — `apt update && apt upgrade -y`
2. **Install Docker** — official Docker CE + Docker Compose plugin
3. **Install Nginx + Certbot** — `nginx`, `certbot`, `python3-certbot-nginx`
4. **DNS verification** — check that `stackless.cloud` and `api.stackless.cloud` resolve to VPS IP
5. **Environment setup** — prompt user for all required secrets, write `.env.production`
6. **Docker build + start** — `docker compose -f docker-compose.prod.yml up -d --build`
7. **Wait for health checks** — poll `/health` on backend until ready
8. **Write Nginx configs** — create site configs for both domains
9. **Enable Nginx sites** — symlink to `sites-enabled`, test config, reload
10. **Certbot SSL** — `certbot --nginx` for both domains, auto-redirect HTTP→HTTPS
11. **Auto-renewal cron** — `certbot renew --dry-run` verify, cron job added
12. **Final health check** — curl `https://stackless.cloud` and `https://api.stackless.cloud/health`
13. **Print summary** — show all service statuses and URLs

---

## 7. Security Checklist

- [ ] UFW firewall: allow only 22 (SSH), 80 (HTTP), 443 (HTTPS)
- [ ] MongoDB/Redis/RustFS ports NOT exposed to host
- [ ] Strong randomly generated passwords for all internal services
- [ ] JWT SECRET_KEY is 64+ chars random
- [ ] SSH key-based auth on VPS (disable password auth)
- [ ] Certbot auto-renewal verified with dry-run

---

## 8. Resource Allocation (8GB RAM, 2 CPU)

| Service | Est. RAM |
|---------|----------|
| MongoDB | ~500MB |
| Redis | ~100MB |
| RustFS | ~100MB |
| Backend (2 workers) | ~300MB |
| Celery worker (2 concurrency) | ~400MB |
| Celery beat | ~100MB |
| Frontend (Nginx) | ~50MB |
| Host OS + Nginx | ~500MB |
| **Total** | **~2GB** (comfortable headroom) |
