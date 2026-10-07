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
    import os
    from app.core.logging import logger

    admin_email = (os.getenv("SUPERADMIN_EMAIL") or "").lower().strip()
    admin_password = os.getenv("SUPERADMIN_PASSWORD") or ""
    admin_name = os.getenv("SUPERADMIN_NAME") or "Super Administrator"

    if not admin_email or not admin_password:
        return

    try:
        stmt = select(User).where(User.email == admin_email)
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if not existing:
            new_u = User(
                email=admin_email,
                hashed_password=get_password_hash(admin_password),
                full_name=admin_name,
                role="super_admin",
                permissions_json={"all": True},
                is_active=True,
            )
            db.add(new_u)
            await db.commit()
            logger.info(f"Initialized default superadmin account: {admin_email}")
        else:
            needs_commit = False
            try:
                if not verify_password(admin_password, existing.hashed_password):
                    existing.hashed_password = get_password_hash(admin_password)
                    needs_commit = True
            except Exception:
                existing.hashed_password = get_password_hash(admin_password)
                needs_commit = True

            if existing.role != "super_admin":
                existing.role = "super_admin"
                existing.permissions_json = {"all": True}
                needs_commit = True

            if needs_commit:
                await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Error ensuring default superadmin: {e}")

@router.post("/login", response_model=Token)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    from app.core.logging import logger

    await ensure_default_accounts(db)

    email_clean = credentials.email.lower().strip()
    stmt = select(User).where(User.email == email_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        logger.warning(f"Login failed: User '{email_clean}' not found.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    try:
        is_valid = verify_password(credentials.password, user.hashed_password)
    except Exception as err:
        logger.error(f"Password verification error: {err}")
        is_valid = False

    if not is_valid:
        logger.warning(f"Login failed: Invalid password for '{email_clean}'.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is inactive",
        )

    access_token = create_access_token(subject=str(user.id), role=user.role)
    return Token(access_token=access_token, token_type="bearer", role=user.role)

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    stmt = select(User).order_by(User.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/users", response_model=UserResponse)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    clean_email = user_in.email.lower().strip()
    stmt = select(User).where(User.email == clean_email)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    target_role = user_in.role.lower().strip()

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
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User account not found")

    if target.role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Admins are strictly prohibited from modifying Super Administrator accounts.",
        )

    if target.role == "admin" and admin.role != "super_admin" and target.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Super Administrators can modify Admin accounts.",
        )

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
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User account not found")

    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    if target.role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Admins are strictly prohibited from removing or deleting Super Administrators.",
        )

    if target.role == "admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only Super Administrators can delete Admin accounts.",
        )

    await db.delete(target)
    await db.commit()
    return {"status": "success", "message": f"User account '{target.email}' deleted successfully"}

