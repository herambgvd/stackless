"""Periodic task that fires scheduled reports based on their schedule config."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from celery_worker import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="apps.reports.beat_task.dispatch_due_reports")
def dispatch_due_reports():
    """Celery Beat task: dispatch all scheduled reports that are due."""
    try:
        _run_async(_dispatch())
        logger.info("dispatch_due_reports completed")
    except Exception as exc:
        logger.error("dispatch_due_reports failed: %s", exc)


async def _dispatch() -> None:
    from core.database import init_db
    from apps.reports.models import ScheduledReport

    await init_db()

    now = datetime.now(tz=timezone.utc)
    all_active = await ScheduledReport.find(ScheduledReport.is_active == True).to_list()  # noqa: E712

    for report in all_active:
        if _is_due(report, now):
            from celery_worker import celery_app as _app
            _app.send_task(
                "apps.reports.tasks.send_scheduled_report",
                args=[str(report.id)],
            )
            logger.info("Dispatched report: %s", report.name)


def _is_due(report, now: datetime) -> bool:
    """Check if the report should run at this hour."""
    last = report.last_sent_at

    if report.schedule == "daily":
        if last and (now - last).total_seconds() < 23 * 3600:
            return False
        return now.hour == 8  # Send at 8 AM UTC

    elif report.schedule == "weekly":
        day = report.day_of_week if report.day_of_week is not None else 0  # Monday
        if last and (now - last).total_seconds() < 6 * 24 * 3600:
            return False
        return now.weekday() == day and now.hour == 8

    elif report.schedule == "monthly":
        dom = report.day_of_month if report.day_of_month else 1
        if last and last.month == now.month and last.year == now.year:
            return False
        return now.day == dom and now.hour == 8

    return False
