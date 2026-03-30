#!/usr/bin/env python3
"""
Create a Super Admin user for Stackless platform.

Usage:
    cd backend
    python create_superadmin.py

This creates a Super Admin with is_superuser=True and NO tenant_id,
so they can manage all organizations from the platform level.
"""

import asyncio
import getpass
import re
import sys

import motor.motor_asyncio
from beanie import init_beanie

from core.config import get_settings
from core.security import hash_password
from apps.auth.models import User, RefreshToken
from apps.tenants.models import Tenant
from apps.rbac.models import Role
from apps.schema_engine.models import AppDefinition, ModelDefinition
from apps.rules_engine.models import RuleSet
from apps.approval_engine.models import ApprovalFlow, ApprovalRequest
from apps.workflow_engine.models import Workflow, WorkflowRun
from apps.notifications.models import NotificationTemplate, NotificationLog
from apps.portal.models import PortalSubmission
from apps.ai_builder.models import TenantAIConfig, ChatSession as AIChatSession

settings = get_settings()


async def init_db():
    from core.database import _build_mongo_uri
    client = motor.motor_asyncio.AsyncIOMotorClient(
        _build_mongo_uri(), serverSelectionTimeoutMS=5000
    )
    database = client[settings.MONGODB_DB_NAME]
    await init_beanie(
        database=database,
        document_models=[
            User, RefreshToken, Tenant, Role,
            AppDefinition, ModelDefinition, RuleSet,
            ApprovalFlow, ApprovalRequest,
            Workflow, WorkflowRun,
            NotificationTemplate, NotificationLog,
            PortalSubmission, TenantAIConfig, AIChatSession,
        ],
    )


def validate_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


async def main():
    print("=" * 50)
    print("  Stackless — Create Super Admin")
    print("=" * 50)
    print()

    # Collect input
    email = input("Email: ").strip()
    if not validate_email(email):
        print("Error: Invalid email format.")
        sys.exit(1)

    full_name = input("Full Name: ").strip()
    if not full_name:
        print("Error: Full name is required.")
        sys.exit(1)

    password = getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8:
        print("Error: Password must be at least 8 characters.")
        sys.exit(1)

    confirm = getpass.getpass("Confirm Password: ")
    if password != confirm:
        print("Error: Passwords do not match.")
        sys.exit(1)

    # Init DB
    print("\nConnecting to database...")
    await init_db()

    # Check if email already exists
    existing = await User.find_one(User.email == email)
    if existing:
        if existing.is_superuser:
            print(f"Super Admin with email '{email}' already exists.")
            sys.exit(0)
        # Upgrade existing user to superuser — clear tenant_id so they act as platform admin
        existing.is_superuser = True
        existing.is_active = True
        existing.tenant_id = None
        await existing.save()
        print(f"Existing user '{email}' upgraded to Super Admin (tenant_id cleared).")
        sys.exit(0)

    # Create Super Admin (no tenant_id)
    user = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        tenant_id=None,
        roles=["admin"],
        is_active=True,
        is_superuser=True,
    )
    await user.insert()

    print()
    print("Super Admin created successfully!")
    print(f"  Email:    {email}")
    print(f"  Name:     {full_name}")
    print(f"  Superuser: True")
    print()
    print("You can now log in at the Stackless dashboard.")
    print("As Super Admin, you'll see Organizations & AI Settings in the sidebar.")


if __name__ == "__main__":
    asyncio.run(main())
