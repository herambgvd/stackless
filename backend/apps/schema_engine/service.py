"""Thin re-export layer — preserves the original public API so that
routes.py, tests, and any other importers continue to work unchanged.
"""
from apps.schema_engine.app_service import (  # noqa: F401
    create_new_app,
    delete_app_cascade,
    update_existing_app,
)
from apps.schema_engine.model_service import (  # noqa: F401
    create_new_model,
    delete_model_cascade,
    update_existing_model,
)
from apps.schema_engine.record_service import (  # noqa: F401
    amend_record,
    create_record,
    delete_record,
    get_record,
    list_records,
    set_record_docstatus,
    update_record,
    validate_record_against_schema,
)
from apps.schema_engine.hooks import (  # noqa: F401
    _apply_rules,
    _dispatch_record_workflows,
    _dispatch_rule_actions,
    _run_server_scripts,
    _write_audit_log,
)
from apps.schema_engine.app_service import _slug_from_name  # noqa: F401
from apps.schema_engine.model_service import (  # noqa: F401
    _ensure_model_indexes,
    _model_slug_from_name,
)
from apps.schema_engine.record_service import (  # noqa: F401
    _compute_formula_fields,
    _populate_relation_fields,
)
