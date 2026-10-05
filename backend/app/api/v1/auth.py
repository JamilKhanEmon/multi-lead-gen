"""
Authentication & User Management Endpoints
"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.api.deps import get_db, get_current_user, require_admin, require_super_admin
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.audit import User
from app.schemas.auth import (
    LoginRequest,
    Token,
    UserResponse,
    UserCreate,
    UserUpdate,
    UserPermissionsUpdate,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


async def ensure_default_accounts(db: AsyncSession):
    """Auto-seeds initial Super Admin and Admin accounts if not present."""
    import os
    admin_email = os.getenv("SUPERADMIN_EMAIL", "superadmin@leadgen.local").lower().strip()
    admin_password = os.getenv("SUPERADMIN_PASSWORD", "SuperAdmin@2026!")

    default_accounts = [
        {
            "email": admin_email,
            "password": admin_password,
            "full_name": os.getenv("SUPERADMIN_NAME", "Chief Super Administrator"),
            "role": "super_admin",
            "permissions_json": {
                "all": True,
                "can_view_dashboard": True,
                "can_view_leads": True,
                "can_export_leads": True,
                "can_run_research": True,
                "can_edit_campaigns": True,
                "can_access_voice": True,
                "can_manage_templates": True,
                "can_manage_users": True,
            },
        },
    ]

    for acc in default_accounts:
        stmt = select(User).where(User.email == acc["email"])
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if not existing:
            new_u = User(
                email=acc["email"],
                hashed_password=get_password_hash(acc["password"]),
                full_name=acc["full_name"],
                role=acc["role"],
                permissions_json=acc["permissions_json"],
                is_active=True,
            )
            db.add(new_u)
        else:
            try:
                if not verify_password(acc["password"], existing.hashed_password):
                    existing.hashed_password = get_password_hash(acc["password"])
            except Exception:
                existing.hashed_password = get_password_hash(acc["password"])
            if acc["email"] == "superadmin@leadgen.local" and existing.role != "super_admin":
                existing.role = "super_admin"
                existing.permissions_json = acc["permissions_json"]
    await db.commit()


@router.post("/login", response_model=Token)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user with email/password and issue signed JWT token."""
    await ensure_default_accounts(db)

    stmt = select(User).where(User.email == credentials.email.lower().strip())
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is inactive",
        )

    access_token = create_access_token(subject=user.id, role=user.role)
    return Token(access_token=access_token, token_type="bearer", role=user.role)


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Returns profile of currently authenticated user."""
    return current_user


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List team members (Admin / Super Admin only)."""
    stmt = select(User).order_by(User.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new user account.
    - Super Admins can create Admins and Members.
    - Admins can ONLY create Members (and assign dashboard permissions).
    """
    clean_email = user_in.email.lower().strip()
    stmt = select(User).where(User.email == clean_email)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    target_role = user_in.role.lower().strip()

    # Security rule: Only Super Admins can create Super Admins or Admins!
    if target_role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Only Super Administrators can create other Super Admins.",
        )
    if target_role == "admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Only Super Administrators can create other Admins. Standard Admins can only add Members.",
        )

    valid_roles = ["super_admin", "admin", "member", "reviewer", "sales"]
    if target_role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Allowed roles: {', '.join(valid_roles)}",
        )

    # Set default dashboard permissions based on role
    default_perms = {
        "can_view_dashboard": True,
        "can_view_leads": True,
        "can_export_leads": True,
        "can_run_research": False,
        "can_edit_campaigns": False,
        "can_access_voice": False,
    }
    if target_role == "super_admin":
        default_perms = {
            "all": True,
            "can_view_dashboard": True,
            "can_view_leads": True,
            "can_export_leads": True,
            "can_run_research": True,
            "can_edit_campaigns": True,
            "can_access_voice": True,
            "can_manage_templates": True,
            "can_manage_users": True,
        }
    elif target_role == "admin":
        default_perms = {
            "all": False,
            "can_view_dashboard": True,
            "can_view_leads": True,
            "can_export_leads": True,
            "can_run_research": True,
            "can_edit_campaigns": True,
            "can_access_voice": True,
            "can_manage_templates": False,
            "can_manage_users": True,
        }

    perms = {**default_perms, **(user_in.permissions_json or {})}

    new_user = User(
        email=clean_email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name.strip(),
        role=target_role,
        is_active=True,
        permissions_json=perms,
        created_by_id=admin.id,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    user_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update user account and permissions.
    - Super Admins can update any user or role.
    - Admins CANNOT modify Super Admins or elevate users to Admin/Super Admin.
    - Admins can assign dashboard permissions to Members.
    """
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User account not found")

    # Protection Rule 1: Admins cannot touch Super Admins
    if target.role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Admins are strictly prohibited from modifying Super Administrator accounts.",
        )

    # Protection Rule 2: Admins cannot modify other Admins
    if target.role == "admin" and admin.role != "super_admin" and target.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Super Administrators can modify Admin accounts.",
        )

    # Protection Rule 3: Admins cannot promote anyone to Admin or Super Admin
    if user_in.role:
        new_role = user_in.role.lower().strip()
        if new_role in ["super_admin", "admin"] and admin.role != "super_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Only Super Administrators can grant Admin or Super Admin privileges.",
            )
        target.role = new_role

    if user_in.full_name:
        target.full_name = user_in.full_name.strip()

    if user_in.is_active is not None:
        if target.role == "super_admin" and target.id == admin.id and not user_in.is_active:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own Super Admin account.")
        target.is_active = user_in.is_active

    if user_in.password:
        target.hashed_password = get_password_hash(user_in.password)

    if user_in.permissions_json is not None:
        current_perms = dict(target.permissions_json or {})
        current_perms.update(user_in.permissions_json)
        target.permissions_json = current_perms

    await db.commit()
    await db.refresh(target)
    return target


@router.patch("/users/{user_id}/permissions", response_model=UserResponse)
async def update_member_permissions(
    user_id: uuid.UUID,
    perm_in: UserPermissionsUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update dashboard and pipeline permissions for an assigned member."""
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User account not found")

    if target.role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Admins cannot alter Super Admin permissions.",
        )

    current_perms = dict(target.permissions_json or {})
    current_perms.update(perm_in.permissions_json)
    target.permissions_json = current_perms

    await db.commit()
    await db.refresh(target)
    return target


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a user account.
    - Super Admins can delete any user except themselves.
    - Admins CANNOT delete Super Admins or other Admins.
    - Admins can only delete Member accounts.
    """
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User account not found")

    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    # CRITICAL SECURITY RULE: Admins CANNOT remove Super Admins!
    if target.role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Admins are strictly prohibited from removing or deleting Super Administrators.",
        )

    # Admins cannot delete other Admins
    if target.role == "admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Super Administrators can delete Admin accounts.",
        )

    await db.delete(target)
    await db.commit()
    return {"status": "success", "message": f"User account '{target.email}' deleted successfully"}

