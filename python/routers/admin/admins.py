"""
Admins Management Router

CRUD operations for admin users.
Only owner and global_admin can access these endpoints.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, timezone

from core.logging import get_logger
from services.supabase.base import get_supabase_client

logger = get_logger(__name__)

router = APIRouter(prefix="/admins", tags=["Admins Management"])

# Role type
AdminRole = Literal["owner", "global_admin", "local_admin", "moderator"]

# Role hierarchy for permission checks
ROLE_HIERARCHY = {
    "owner": 4,
    "global_admin": 3,
    "local_admin": 2,
    "moderator": 1,
}


class AdminCreate(BaseModel):
    email: str
    name: Optional[str] = None
    role: AdminRole = "moderator"


class AdminUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[AdminRole] = None
    is_active: Optional[bool] = None


def get_current_admin(request: Request) -> dict:
    """Get current admin from request state (set by middleware)."""
    admin = getattr(request.state, "admin", None)
    if not admin:
        raise HTTPException(401, "Not authenticated")
    return admin


def require_admin_management_role(current_admin: dict):
    """Check if current admin can manage other admins."""
    if current_admin["role"] not in ["owner", "global_admin"]:
        raise HTTPException(403, "Only owner and global_admin can manage admins")


def can_modify_role(current_role: str, target_role: str) -> bool:
    """Check if current admin can assign/modify target role."""
    # Owner can do anything
    if current_role == "owner":
        return True
    # Global admin can only manage local_admin and moderator
    if current_role == "global_admin":
        return target_role in ["local_admin", "moderator"]
    return False


@router.get("")
async def list_admins(request: Request):
    """Get list of all admins."""
    current_admin = get_current_admin(request)
    require_admin_management_role(current_admin)

    supabase = get_supabase_client()
    result = supabase.table("admins").select("*").order("created_at").execute()

    return {"admins": result.data}


@router.post("")
async def create_admin(data: AdminCreate, request: Request):
    """Create new admin."""
    current_admin = get_current_admin(request)
    require_admin_management_role(current_admin)

    # Check role permission
    if not can_modify_role(current_admin["role"], data.role):
        raise HTTPException(403, f"You cannot create admin with role '{data.role}'")

    # Cannot create another owner
    if data.role == "owner":
        raise HTTPException(403, "Cannot create another owner")

    supabase = get_supabase_client()

    # Check if email already exists
    existing = supabase.table("admins").select("id").eq("email", data.email.lower()).execute()
    if existing.data:
        raise HTTPException(400, "Admin with this email already exists")

    # Create admin
    result = supabase.table("admins").insert({
        "email": data.email.lower(),
        "name": data.name,
        "role": data.role,
        "is_active": True,
    }).execute()

    if not result.data:
        raise HTTPException(500, "Failed to create admin")

    logger.info(f"Admin created: {data.email} ({data.role}) by {current_admin['email']}")

    return {"admin": result.data[0]}


@router.patch("/{admin_id}")
async def update_admin(admin_id: str, data: AdminUpdate, request: Request):
    """Update admin (role, name, is_active)."""
    current_admin = get_current_admin(request)
    require_admin_management_role(current_admin)

    supabase = get_supabase_client()

    # Get target admin
    target = supabase.table("admins").select("*").eq("id", admin_id).execute()
    if not target.data:
        raise HTTPException(404, "Admin not found")

    target_admin = target.data[0]

    # Cannot modify owner (except by owner themselves for name)
    if target_admin["role"] == "owner" and current_admin["role"] != "owner":
        raise HTTPException(403, "Cannot modify owner")

    # Cannot modify yourself (except name)
    if target_admin["id"] == current_admin["id"]:
        if data.role is not None or data.is_active is not None:
            raise HTTPException(400, "Cannot change your own role or status")

    # Check role permission for new role
    if data.role is not None:
        if not can_modify_role(current_admin["role"], data.role):
            raise HTTPException(403, f"You cannot assign role '{data.role}'")
        # Cannot change to owner
        if data.role == "owner":
            raise HTTPException(403, "Cannot change role to owner")

    # Build update dict
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.role is not None:
        update_data["role"] = data.role
    if data.is_active is not None:
        update_data["is_active"] = data.is_active

    if not update_data:
        raise HTTPException(400, "No data to update")

    result = supabase.table("admins").update(update_data).eq("id", admin_id).execute()

    logger.info(f"Admin updated: {target_admin['email']} -> {update_data} by {current_admin['email']}")

    return {"admin": result.data[0]}


@router.delete("/{admin_id}")
async def delete_admin(admin_id: str, request: Request):
    """Delete admin (only owner can delete)."""
    current_admin = get_current_admin(request)

    # Only owner can delete admins
    if current_admin["role"] != "owner":
        raise HTTPException(403, "Only owner can delete admins")

    supabase = get_supabase_client()

    # Get target admin
    target = supabase.table("admins").select("*").eq("id", admin_id).execute()
    if not target.data:
        raise HTTPException(404, "Admin not found")

    target_admin = target.data[0]

    # Cannot delete yourself
    if target_admin["id"] == current_admin["id"]:
        raise HTTPException(400, "Cannot delete yourself")

    # Cannot delete owner
    if target_admin["role"] == "owner":
        raise HTTPException(403, "Cannot delete owner")

    supabase.table("admins").delete().eq("id", admin_id).execute()

    logger.info(f"Admin deleted: {target_admin['email']} by {current_admin['email']}")

    return {"success": True}
