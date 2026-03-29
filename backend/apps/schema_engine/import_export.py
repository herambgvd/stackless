from __future__ import annotations

import csv
import io
from typing import AsyncGenerator

from fastapi import UploadFile
from fastapi.responses import StreamingResponse

from apps.schema_engine.models import FieldType
from apps.schema_engine.repository import get_model_by_slug
from apps.schema_engine.service import create_record, list_records


# ── Export ────────────────────────────────────────────────────────────────────

def _field_names(model) -> list[str]:
    """Return ordered list of exportable field names."""
    return [f.name for f in sorted(model.fields, key=lambda x: x.order)]


def _record_to_row(record: dict, field_names: list[str]) -> list:
    data = record.get("data", record)
    row = []
    for name in field_names:
        val = data.get(name, "")
        if isinstance(val, list):
            val = ", ".join(str(v) for v in val)
        elif val is None:
            val = ""
        row.append(str(val))
    return row


async def export_csv(
    model_slug: str,
    app_id: str,
    tenant_id: str,
) -> StreamingResponse:
    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        from core.exceptions import NotFoundError
        raise NotFoundError("Model", model_slug)

    field_names = _field_names(model)

    async def generate() -> AsyncGenerator[str, None]:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["_id"] + field_names)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        page = 1
        while True:
            result = await list_records(
                model_slug=model_slug, app_id=app_id, tenant_id=tenant_id,
                page=page, page_size=200, sort_field="created_at", sort_dir=-1,
            )
            for rec in result.items:
                writer.writerow([str(rec.get("id", rec.get("_id", "")))] + _record_to_row(rec, field_names))
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)
            if not result.has_more:
                break
            page += 1

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{model_slug}.csv"'},
    )


async def export_xlsx(
    model_slug: str,
    app_id: str,
    tenant_id: str,
) -> StreamingResponse:
    import openpyxl
    from openpyxl.styles import Font, PatternFill

    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        from core.exceptions import NotFoundError
        raise NotFoundError("Model", model_slug)

    field_names = _field_names(model)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = model_slug[:31]

    # Header row
    headers = ["_id"] + field_names
    ws.append(headers)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="4F46E5")
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill

    # Data rows
    page = 1
    while True:
        result = await list_records(
            model_slug=model_slug, app_id=app_id, tenant_id=tenant_id,
            page=page, page_size=500, sort_field="created_at", sort_dir=-1,
        )
        for rec in result.items:
            ws.append([str(rec.get("id", rec.get("_id", "")))] + _record_to_row(rec, field_names))
        if not result.has_more:
            break
        page += 1

    # Auto-fit columns
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{model_slug}.xlsx"'},
    )


# ── Import ────────────────────────────────────────────────────────────────────

async def import_csv(
    model_slug: str,
    app_id: str,
    tenant_id: str,
    file: UploadFile,
    user_id: str,
    column_map: dict[str, str] | None = None,
) -> dict:
    """
    Parse uploaded CSV and create records.
    column_map: {csv_column_name -> model_field_name}  (None = auto-match by name)
    Returns {"created": N, "failed": N, "errors": [...]}
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return {"created": 0, "failed": 0, "errors": ["Empty or invalid CSV file"]}

    model = await get_model_by_slug(model_slug, app_id)
    if model is None:
        from core.exceptions import NotFoundError
        raise NotFoundError("Model", model_slug)

    model_fields = {f.name: f for f in model.fields}

    # Build mapping: csv column -> field name
    if column_map:
        mapping = {csv_col: field_name for csv_col, field_name in column_map.items()
                   if field_name in model_fields}
    else:
        # Auto-map: match by name (case-insensitive), skip _id
        mapping = {}
        for csv_col in (reader.fieldnames or []):
            if csv_col == "_id":
                continue
            normalized = csv_col.strip().lower().replace(" ", "_")
            if normalized in model_fields:
                mapping[csv_col] = normalized
            else:
                # Try exact match
                for fname in model_fields:
                    if fname.lower() == normalized:
                        mapping[csv_col] = fname
                        break

    created = 0
    failed = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):  # row 1 = header
        data: dict = {}
        for csv_col, field_name in mapping.items():
            raw = row.get(csv_col, "").strip()
            if not raw:
                continue
            field = model_fields[field_name]
            # Type coercion
            try:
                if field.type == FieldType.NUMBER or field.type == FieldType.CURRENCY:
                    data[field_name] = float(raw)
                elif field.type == FieldType.BOOLEAN:
                    data[field_name] = raw.lower() in ("true", "1", "yes")
                elif field.type == FieldType.MULTISELECT:
                    data[field_name] = [v.strip() for v in raw.split(",") if v.strip()]
                else:
                    data[field_name] = raw
            except (ValueError, TypeError):
                data[field_name] = raw

        if not data:
            continue

        try:
            await create_record(model_slug, app_id, tenant_id, data, user_id=user_id)
            created += 1
        except Exception as exc:
            failed += 1
            errors.append(f"Row {i}: {str(exc)}")
            if len(errors) >= 50:  # cap error list
                errors.append("... more errors truncated")
                break

    return {"created": created, "failed": failed, "errors": errors}
