from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "flowforge",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "apps.workflow_engine.tasks",
        "apps.notifications.tasks",
        "apps.reports.tasks",
        "apps.reports.beat_task",
        "apps.human_tasks.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "apps.workflow_engine.tasks.*": {"queue": "workflows"},
        "apps.notifications.tasks.*": {"queue": "notifications"},
    },
    beat_schedule={
        "execute-scheduled-workflows": {
            "task": "apps.workflow_engine.tasks.execute_scheduled_workflows",
            "schedule": crontab(minute="*"),  # every minute
        },
        "check-approval-sla-expiry": {
            "task": "apps.workflow_engine.tasks.check_approval_sla_expiry",
            "schedule": crontab(minute="*/5"),  # every 5 minutes
        },
        "dispatch-due-reports": {
            "task": "apps.reports.beat_task.dispatch_due_reports",
            "schedule": crontab(minute="0"),  # every hour on the hour
        },
        "expire-overdue-human-tasks": {
            "task": "apps.human_tasks.tasks.expire_overdue_human_tasks",
            "schedule": crontab(minute="*/10"),  # every 10 minutes
        },
    },
)
