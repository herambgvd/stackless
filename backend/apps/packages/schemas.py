from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from apps.packages.models import PackageLimits


class PackageCreate(BaseModel):
    name: str
    slug: str
    is_active: bool = True
    price_monthly: float = 0.0
    price_yearly: float = 0.0
    limits: PackageLimits = PackageLimits()
    sort_order: int = 0


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    price_monthly: Optional[float] = None
    price_yearly: Optional[float] = None
    limits: Optional[PackageLimits] = None
    sort_order: Optional[int] = None


class PackageResponse(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    price_monthly: float
    price_yearly: float
    limits: PackageLimits
    sort_order: int

    model_config = {"from_attributes": True}
