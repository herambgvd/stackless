from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # MongoDB
    MONGODB_URI: str = "mongodb://admin:password@localhost:27017/flowforge?authSource=admin"
    MONGODB_DB_NAME: str = "flowforge"

    # JWT / Security
    SECRET_KEY: str = "change-me-to-a-long-random-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Redis
    REDIS_URL: str = "redis://:redispass@localhost:6379/0"
    REDIS_PASSWORD: str = "redispass"

    # Celery
    CELERY_BROKER_URL: str = "redis://:redispass@localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://:redispass@localhost:6379/2"

    # RustFS (S3-compatible)
    RUSTFS_ENDPOINT: str = "localhost:9000"
    RUSTFS_ACCESS_KEY: str = "rustfsadmin"
    RUSTFS_SECRET_KEY: str = "rustfspass123"
    RUSTFS_BUCKET_NAME: str = "flowforge-uploads"
    RUSTFS_USE_SSL: bool = False

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:80"

    # Email / SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    EMAIL_FROM: str = "FlowForge <noreply@flowforge.io>"
    # Shared secret for validating inbound email-bounce webhook payloads.
    # Set this to a random string and configure the same value in your SMTP provider.
    # Leave empty to accept bounce events without signature validation (not recommended in production).
    BOUNCE_WEBHOOK_SECRET: str = ""

    # Slack
    SLACK_DEFAULT_WEBHOOK_URL: str = ""

    # App
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # AI Builder
    AI_SESSION_TTL_DAYS: int = 7

    # reCAPTCHA v2 (leave empty to disable captcha validation)
    RECAPTCHA_SECRET_KEY: str = ""
    RECAPTCHA_SITE_KEY: str = ""

    # File uploads
    MAX_UPLOAD_SIZE_MB: int = 25  # maximum allowed file size in megabytes

    # API rate limiting (authenticated endpoints)
    RATE_LIMIT_REQUESTS: int = 300   # max requests per window per user
    RATE_LIMIT_WINDOW_SECONDS: int = 60  # sliding window in seconds

    # OAuth / SSO (leave empty to disable the provider)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    # The frontend URL used to redirect after OAuth callback (e.g. http://localhost:3000)
    APP_BASE_URL: str = "http://localhost:3000"

    # CSRF
    CSRF_SECRET: str = "change-me-csrf-secret"
    CSRF_TOKEN_TTL_SECONDS: int = 3600  # 1 hour

    # Stripe Billing (leave empty to disable)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_STARTER: str = ""  # Stripe price ID for Starter plan ($29/mo)
    STRIPE_PRICE_GROWTH: str = ""   # Stripe price ID for Growth plan ($79/mo)

    @computed_field  # type: ignore[misc]
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @computed_field  # type: ignore[misc]
    @property
    def mongodb_url(self) -> str:
        return self.MONGODB_URI

    @computed_field  # type: ignore[misc]
    @property
    def rustfs_scheme(self) -> str:
        return "https" if self.RUSTFS_USE_SSL else "http"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
