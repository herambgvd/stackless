from fastapi import APIRouter, Depends, HTTPException
from .models import ServerScript, ClientScript
from core.dependencies import get_current_active_user, require_permission
from beanie import PydanticObjectId
from datetime import datetime, timezone

router = APIRouter()

# ── Server Scripts ──────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/server-scripts")
async def list_server_scripts(
    app_id: str,
    user=Depends(require_permission("settings", "read")),
):
    scripts = await ServerScript.find(
        ServerScript.tenant_id == str(user.tenant_id),
        ServerScript.app_id == app_id,
    ).to_list()
    return [s.model_dump(mode="json") for s in scripts]


@router.post("/apps/{app_id}/server-scripts")
async def create_server_script(
    app_id: str,
    body: dict,
    user=Depends(require_permission("settings", "create")),
):
    script = ServerScript(
        tenant_id=str(user.tenant_id),
        app_id=app_id,
        name=body.get("name", "Untitled Script"),
        script_type=body.get("script_type", "before_save"),
        model_slug=body.get("model_slug"),
        enabled=body.get("enabled", True),
        script=body.get("script", ""),
        api_path=body.get("api_path"),
        description=body.get("description"),
        created_by=str(user.id),
    )
    await script.insert()
    return script.model_dump(mode="json")


@router.put("/apps/{app_id}/server-scripts/{script_id}")
async def update_server_script(
    app_id: str,
    script_id: str,
    body: dict,
    user=Depends(require_permission("settings", "update")),
):
    script = await ServerScript.find_one(
        ServerScript.tenant_id == str(user.tenant_id),
        ServerScript.id == PydanticObjectId(script_id),
    )
    if not script:
        raise HTTPException(404, "Not found")
    for k in ["name", "script_type", "model_slug", "enabled", "script", "api_path", "description"]:
        if k in body:
            setattr(script, k, body[k])
    script.updated_at = datetime.now(tz=timezone.utc)
    await script.save()
    return script.model_dump(mode="json")


@router.delete("/apps/{app_id}/server-scripts/{script_id}")
async def delete_server_script(
    app_id: str,
    script_id: str,
    user=Depends(require_permission("settings", "delete")),
):
    script = await ServerScript.find_one(
        ServerScript.tenant_id == str(user.tenant_id),
        ServerScript.id == PydanticObjectId(script_id),
    )
    if script:
        await script.delete()
    return {"ok": True}


@router.post("/apps/{app_id}/server-scripts/{script_id}/test")
async def test_server_script(
    app_id: str,
    script_id: str,
    body: dict,
    user=Depends(require_permission("settings", "update")),
):
    """Run a server script in a sandboxed context with a test doc."""
    script = await ServerScript.find_one(
        ServerScript.tenant_id == str(user.tenant_id),
        ServerScript.id == PydanticObjectId(script_id),
    )
    if not script:
        raise HTTPException(404, "Not found")

    doc = body.get("doc", {})
    output_lines = []

    safe_globals = {
        "__builtins__": {
            "print": lambda *a: output_lines.append(" ".join(str(x) for x in a)),
            "len": len, "str": str, "int": int, "float": float,
            "list": list, "dict": dict, "range": range, "enumerate": enumerate,
            "isinstance": isinstance, "type": type,
            "True": True, "False": False, "None": None,
        },
        "doc": doc,
        "frappe": {
            "throw": lambda msg: (_ for _ in ()).throw(Exception(msg)),
            "msgprint": lambda msg: output_lines.append(f"MSG: {msg}"),
        },
    }

    try:
        exec(compile(script.script, "<script>", "exec"), safe_globals)
        return {"success": True, "output": output_lines, "doc": safe_globals.get("doc", doc)}
    except Exception as e:
        return {"success": False, "error": str(e), "output": output_lines}


# ── Client Scripts ──────────────────────────────────────────────────────────

@router.get("/apps/{app_id}/client-scripts")
async def list_client_scripts(
    app_id: str,
    user=Depends(require_permission("settings", "read")),
):
    scripts = await ClientScript.find(
        ClientScript.tenant_id == str(user.tenant_id),
        ClientScript.app_id == app_id,
    ).to_list()
    return [s.model_dump(mode="json") for s in scripts]


@router.post("/apps/{app_id}/client-scripts")
async def create_client_script(
    app_id: str,
    body: dict,
    user=Depends(require_permission("settings", "create")),
):
    script = ClientScript(
        tenant_id=str(user.tenant_id),
        app_id=app_id,
        name=body.get("name", "Untitled Script"),
        script_type=body.get("script_type", "form_load"),
        model_slug=body.get("model_slug"),
        enabled=body.get("enabled", True),
        script=body.get("script", ""),
        description=body.get("description"),
        created_by=str(user.id),
    )
    await script.insert()
    return script.model_dump(mode="json")


@router.put("/apps/{app_id}/client-scripts/{script_id}")
async def update_client_script(
    app_id: str,
    script_id: str,
    body: dict,
    user=Depends(require_permission("settings", "update")),
):
    script = await ClientScript.find_one(
        ClientScript.tenant_id == str(user.tenant_id),
        ClientScript.id == PydanticObjectId(script_id),
    )
    if not script:
        raise HTTPException(404, "Not found")
    for k in ["name", "script_type", "model_slug", "enabled", "script", "description"]:
        if k in body:
            setattr(script, k, body[k])
    script.updated_at = datetime.now(tz=timezone.utc)
    await script.save()
    return script.model_dump(mode="json")


@router.delete("/apps/{app_id}/client-scripts/{script_id}")
async def delete_client_script(
    app_id: str,
    script_id: str,
    user=Depends(require_permission("settings", "delete")),
):
    script = await ClientScript.find_one(
        ClientScript.tenant_id == str(user.tenant_id),
        ClientScript.id == PydanticObjectId(script_id),
    )
    if script:
        await script.delete()
    return {"ok": True}
