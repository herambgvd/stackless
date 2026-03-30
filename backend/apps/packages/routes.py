from __future__ import annotations

from fastapi import APIRouter, Depends, status

from apps.packages.schemas import PackageCreate, PackageResponse, PackageUpdate
from apps.packages.service import (
    create_package,
    delete_package,
    get_all_packages,
    get_package_by_id,
    seed_default_packages,
    update_package,
)
from core.dependencies import require_superuser
from core.exceptions import ConflictError, NotFoundError

router = APIRouter()


def _fmt(pkg) -> PackageResponse:
    return PackageResponse(
        id=str(pkg.id),
        name=pkg.name,
        slug=pkg.slug,
        is_active=pkg.is_active,
        price_monthly=pkg.price_monthly,
        price_yearly=pkg.price_yearly,
        limits=pkg.limits,
        sort_order=pkg.sort_order,
    )


@router.get("", response_model=list[PackageResponse])
async def list_packages(active_only: bool = False):
    """List all subscription packages. Public — used by billing page and upgrade UI."""
    pkgs = await get_all_packages(active_only=active_only)
    return [_fmt(p) for p in pkgs]


@router.post("", response_model=PackageResponse, status_code=status.HTTP_201_CREATED)
async def create_package_endpoint(
    payload: PackageCreate,
    _=Depends(require_superuser),
):
    """Create a new subscription package (Super Admin only)."""
    from apps.packages.service import get_package_by_slug
    existing = await get_package_by_slug(payload.slug)
    if existing:
        raise ConflictError(f"Package with slug '{payload.slug}' already exists.")
    pkg = await create_package(payload)
    return _fmt(pkg)


@router.get("/{package_id}", response_model=PackageResponse)
async def get_package_endpoint(package_id: str):
    pkg = await get_package_by_id(package_id)
    if not pkg:
        raise NotFoundError("Package", package_id)
    return _fmt(pkg)


@router.put("/{package_id}", response_model=PackageResponse)
async def update_package_endpoint(
    package_id: str,
    payload: PackageUpdate,
    _=Depends(require_superuser),
):
    """Update a subscription package (Super Admin only)."""
    pkg = await update_package(package_id, payload)
    if not pkg:
        raise NotFoundError("Package", package_id)
    return _fmt(pkg)


@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_package_endpoint(
    package_id: str,
    _=Depends(require_superuser),
):
    """Delete a subscription package (Super Admin only)."""
    deleted = await delete_package(package_id)
    if not deleted:
        raise NotFoundError("Package", package_id)


@router.post("/seed", status_code=status.HTTP_200_OK)
async def seed_packages_endpoint(_=Depends(require_superuser)):
    """Seed default packages from built-in plan_limits (idempotent, Super Admin only)."""
    count = await seed_default_packages()
    return {"seeded": count, "message": f"Seeded {count} default packages." if count else "Packages already exist — nothing seeded."}
