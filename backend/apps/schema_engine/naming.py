"""Naming Series — auto-generate human-readable record IDs like INV-2024-00001.

Pattern tokens:
  .YYYY.   → 4-digit year
  .YY.     → 2-digit year
  .MM.     → 2-digit month
  .DD.     → 2-digit day
  .####.   → zero-padded sequential counter (length = number of # chars)
  .#####.  → 5-digit counter, etc.

Special patterns:
  field:fieldname  → use the value of the given field as the record name.
                     The generate_name_from_data() function must be used.

Example: "INV-.YYYY.-.####" → "INV-2024-00001"
Example: "field:customer_name" → uses data["customer_name"] as the _name
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from core.database import get_tenant_db

_COUNTER_COL = "naming_counters"


def is_field_naming(series_pattern: str) -> bool:
    """Return True if the naming series uses a field value (field:fieldname)."""
    return series_pattern.strip().startswith("field:")


def get_field_name_from_series(series_pattern: str) -> str:
    """Extract the field name from a 'field:fieldname' naming series."""
    return series_pattern.strip()[len("field:"):].strip()


async def generate_name(series_pattern: str, tenant_id: str, data: dict | None = None) -> str:
    """Resolve all tokens in *series_pattern* and return the next name.

    If the series uses 'field:fieldname' syntax, *data* must be provided and
    the value of the named field is returned as-is.
    """
    if is_field_naming(series_pattern):
        field_name = get_field_name_from_series(series_pattern)
        if data and field_name in data and data[field_name]:
            return str(data[field_name])
        # Fallback to a timestamp-based unique name if field is empty
        import time
        return f"NEW-{int(time.time())}"
    now = datetime.now(tz=timezone.utc)

    # Resolve date tokens first
    resolved = series_pattern
    resolved = resolved.replace(".YYYY.", now.strftime("%Y"))
    resolved = resolved.replace(".YY.",   now.strftime("%y"))
    resolved = resolved.replace(".MM.",   now.strftime("%m"))
    resolved = resolved.replace(".DD.",   now.strftime("%d"))

    # Find sequential counter token (one or more # inside dots)
    counter_match = re.search(r'\.(\#+)\.', resolved)
    if counter_match:
        hashes = counter_match.group(1)
        pad_len = len(hashes)
        # The counter key uniquely identifies this series variant (includes resolved date)
        counter_key = re.sub(r'\.\#+\.', '.#.', resolved)  # normalise back to .#.
        counter_key = f"{tenant_id}::{counter_key}"

        seq = await _next_sequence(counter_key, tenant_id)
        counter_str = str(seq).zfill(pad_len)
        resolved = resolved.replace(f".{hashes}.", counter_str, 1)

    return resolved


async def _next_sequence(counter_key: str, tenant_id: str) -> int:
    """Atomically increment and return the next sequence number for *counter_key*."""
    db = get_tenant_db(tenant_id)
    col = db[_COUNTER_COL]

    result = await col.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,  # return AFTER update
    )
    return result["seq"]
