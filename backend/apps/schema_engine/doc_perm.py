"""DocPerm — model-level role-based permissions and row-level security.

If a model has no permissions configured, all authenticated users are allowed
(backwards-compatible with existing models).

Permission actions: read | write | create | delete | submit
"""
from __future__ import annotations

from apps.schema_engine.models import ModelDefinition, UserPermission
from apps.auth.models import User


def _user_roles(user: User) -> set[str]:
    """Collect all role names for a user including built-ins."""
    roles: set[str] = set(user.roles or [])
    if user.is_superuser:
        roles.add("System Manager")
    if user.tenant_id:
        roles.add("Tenant User")
    return roles


def check_model_permission(
    model: ModelDefinition,
    user: User,
    action: str,  # read | write | create | delete | submit
) -> bool:
    """Return True if *user* is allowed to perform *action* on *model*.

    Logic:
    - Superusers without a tenant (platform admins) are always allowed.
    - If the model has no permission rows, everyone is allowed (open by default).
    - Otherwise, check if any of the user's roles has the required permission bit.
    """
    # Platform superadmin — unrestricted
    if user.is_superuser and not user.tenant_id:
        return True

    # No permissions configured → open (backwards-compatible)
    if not model.permissions:
        return True

    user_roles = _user_roles(user)

    for perm in model.permissions:
        if perm.role in user_roles:
            allowed = getattr(perm, action, False)
            if allowed:
                return True

    return False


def assert_model_permission(
    model: ModelDefinition,
    user: User,
    action: str,
) -> None:
    """Raise ForbiddenError if user cannot perform *action* on *model*."""
    from core.exceptions import ForbiddenError
    if not check_model_permission(model, user, action):
        raise ForbiddenError(
            f"You do not have '{action}' permission on '{model.name}'."
        )


def get_user_perm_level(model: ModelDefinition, user: User) -> int:
    """Return the maximum field perm_level the user can access on *model*.

    - Platform superadmins always get level 9 (full access).
    - If no permissions configured → open → level 9.
    - Otherwise: max perm_level across all matching role rows.
    - Users with no matching role row get level 0 (only level-0 fields).
    """
    if user.is_superuser and not user.tenant_id:
        return 9

    if not model.permissions:
        return 9  # open model — no restrictions

    user_roles = _user_roles(user)
    max_level = 0
    for perm in model.permissions:
        if perm.role in user_roles and perm.read:
            level = getattr(perm, "perm_level", 0)
            if level > max_level:
                max_level = level

    return max_level


def mask_record_fields(
    record: dict,
    model: ModelDefinition,
    max_perm_level: int,
) -> dict:
    """Remove fields from *record* whose perm_level > *max_perm_level*.

    Meta-fields (keys starting with '_') and system keys ('id', 'created_at',
    'updated_at') are never masked.
    """
    if max_perm_level >= 9:
        return record  # full access — fast path

    restricted = {
        f.name
        for f in model.fields
        if getattr(f, "perm_level", 0) > max_perm_level
    }
    if not restricted:
        return record

    return {
        k: v for k, v in record.items()
        if k not in restricted
    }


def get_row_level_filters(model: ModelDefinition, user: User) -> list[dict]:
    """Return MongoDB filter conditions enforcing User Permissions (row-level security).

    Returns a list of {field: value} dicts that must ALL match (AND logic).
    Platform superadmins and open models return an empty list (no restriction).

    Example: if a "Sales User" has a UserPermission(field_name="owner", based_on_user_field="id")
    and the current user has that role, this returns [{"owner": "<user_id>"}].
    """
    # Platform superadmin — unrestricted
    if user.is_superuser and not user.tenant_id:
        return []

    user_perms = getattr(model, "user_permissions", [])
    if not user_perms:
        return []

    user_roles = _user_roles(user)

    # Map based_on_user_field to actual user attribute values
    user_field_values: dict[str, str] = {
        "id": str(user.id),
        "email": user.email or "",
        "tenant_id": user.tenant_id or "",
    }

    filters: list[dict] = []
    seen_fields: set[str] = set()

    for up in user_perms:
        if up.role not in user_roles:
            continue
        if up.field_name in seen_fields:
            continue  # first matching rule wins per field
        user_value = user_field_values.get(up.based_on_user_field, "")
        if user_value:
            filters.append({up.field_name: user_value})
            seen_fields.add(up.field_name)

    return filters
