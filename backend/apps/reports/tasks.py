from __future__ import annotations

import asyncio
import csv
import io
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


@celery_app.task(name="apps.reports.tasks.send_scheduled_report", bind=True, max_retries=2)
def send_scheduled_report(self, report_id: str):
    """Celery task: generate and email a scheduled report."""
    try:
        _run_async(_async_send_report(report_id))
    except Exception as exc:
        logger.error("send_scheduled_report failed for %s: %s", report_id, exc)
        raise self.retry(exc=exc)


async def _async_send_report(report_id: str) -> None:
    from core.database import init_db
    from apps.reports.models import ScheduledReport
    from beanie import PydanticObjectId

    await init_db()

    try:
        oid = PydanticObjectId(report_id)
    except Exception:
        logger.error("Invalid report_id: %s", report_id)
        return

    report = await ScheduledReport.get(oid)
    if report is None or not report.is_active:
        return

    try:
        attachment_bytes, filename, content_type = await _generate_attachment(report)
        await _send_email(report, attachment_bytes, filename, content_type)
        report.last_sent_at = datetime.now(tz=timezone.utc)
        await report.save()
        logger.info("Report sent: %s → %s", report.name, report.recipients)
    except Exception as exc:
        logger.error("Failed to send report %s: %s", report_id, exc)
        raise


async def _generate_attachment(report) -> tuple[bytes, str, str]:
    from apps.schema_engine.service import list_records
    from apps.schema_engine.repository import get_model_by_slug

    model = await get_model_by_slug(report.model_slug, report.app_id)
    if model is None:
        raise ValueError(f"Model '{report.model_slug}' not found")

    all_records = []
    page = 1
    while True:
        result = await list_records(
            model_slug=report.model_slug,
            app_id=report.app_id,
            tenant_id=report.tenant_id,
            page=page, page_size=500,
            sort_field="created_at", sort_dir=-1,
        )
        all_records.extend(result.items)
        if not result.has_more:
            break
        page += 1

    if report.format == "pdf":
        from apps.schema_engine.pdf_service import generate_pdf_report
        # generate_pdf_report returns a StreamingResponse — we need raw bytes
        pdf_bytes = await _render_pdf_bytes(report.model_slug, report.app_id, report.tenant_id, report.name)
        return pdf_bytes, f"{report.model_slug}_report.pdf", "application/pdf"
    else:
        # CSV
        field_names = [f.name for f in sorted(model.fields, key=lambda x: x.order)]
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["_id"] + field_names)
        for rec in all_records:
            data = rec.get("data", rec)
            row = [str(rec.get("id", rec.get("_id", "")))]
            for fname in field_names:
                val = data.get(fname, "")
                if isinstance(val, list):
                    val = ", ".join(str(v) for v in val)
                elif val is None:
                    val = ""
                row.append(str(val))
            writer.writerow(row)
        return buf.getvalue().encode("utf-8"), f"{report.model_slug}.csv", "text/csv"


async def _render_pdf_bytes(model_slug: str, app_id: str, tenant_id: str, title: str) -> bytes:
    """Duplicate the pdf_service logic but return raw bytes instead of StreamingResponse."""
    import io
    from fpdf import FPDF
    from datetime import datetime, timezone
    from apps.schema_engine.service import list_records
    from apps.schema_engine.repository import get_model_by_slug
    from apps.schema_engine.models import FieldType

    model = await get_model_by_slug(model_slug, app_id)
    all_records = []
    page = 1
    while True:
        result = await list_records(
            model_slug=model_slug, app_id=app_id, tenant_id=tenant_id,
            page=page, page_size=500, sort_field="created_at", sort_dir=-1,
        )
        all_records.extend(result.items)
        if not result.has_more:
            break
        page += 1

    exportable_fields = [
        f for f in sorted(model.fields, key=lambda x: x.order)
        if f.type not in (FieldType.FORMULA, FieldType.CHILD_TABLE)
    ][:6]
    field_names = [f.name for f in exportable_fields]
    field_labels = [f.label or f.name for f in exportable_fields]

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, title or f"{model.name} Report", ln=True, align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(120, 120, 120)
    now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    pdf.cell(0, 6, f"Generated: {now}  |  Records: {len(all_records)}", ln=True, align="C")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    page_width = pdf.w - 2 * pdf.l_margin
    col_w = page_width / len(field_names) if field_names else page_width
    pdf.set_fill_color(79, 70, 229)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    for label in field_labels:
        pdf.cell(col_w, 8, label[:20], border=0, fill=True, align="C")
    pdf.ln()
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 8)
    for i, rec in enumerate(all_records):
        data = rec.get("data", rec)
        fill = i % 2 == 0
        if fill:
            pdf.set_fill_color(245, 245, 255)
        for fname in field_names:
            val = data.get(fname, "")
            if isinstance(val, (list, dict)):
                val = str(val)
            pdf.cell(col_w, 7, str(val or "")[:28], border=0, fill=fill)
        pdf.ln()

    return bytes(pdf.output())


async def _send_email(report, attachment_bytes: bytes, filename: str, content_type: str) -> None:
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders
    from core.config import get_settings

    settings = get_settings()
    if not settings.SMTP_USERNAME:
        logger.warning("SMTP not configured, skipping email for report %s", report.id)
        return

    msg = MIMEMultipart()
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = ", ".join(report.recipients)
    msg["Subject"] = f"Scheduled Report: {report.name}"

    now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    body = (
        f"Hi,\n\n"
        f"Please find attached your scheduled report: {report.name}\n"
        f"Model: {report.model_slug}\n"
        f"Date: {now_str}\n\n"
        f"This report was automatically generated by FlowForge.\n"
    )
    msg.attach(MIMEText(body, "plain"))

    part = MIMEBase("application", "octet-stream")
    part.set_payload(attachment_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(part)

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME,
        password=settings.SMTP_PASSWORD,
        use_tls=False,
        start_tls=settings.SMTP_USE_TLS,
    )
