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
from app.schemas.auth import LoginRequest, Token, UserResponse, UserCreate

router = APIRouter(prefix="/auth", tags=["Authentication"])


async def ensure_default_accounts(db: AsyncSession):
    """Auto-seeds initial single Admin account if not present."""
    default_accounts = [
        {
            "email": "admin@leadgen.local",
            "password": "Admin@2026!",
            "full_name": "Platform Administrator",
            "role": "admin",
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
                is_active=True,
            )
            db.add(new_u)
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
    """Create a new user account (Admin / Super Admin only)."""
    clean_email = user_in.email.lower().strip()
    stmt = select(User).where(User.email == clean_email)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    if user_in.role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admins can create other Super Admins",
        )

    valid_roles = ["super_admin", "admin", "sales", "reviewer"]
    if user_in.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Allowed roles: {', '.join(valid_roles)}",
        )

    new_user = User(
        email=clean_email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name.strip(),
        role=user_in.role,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user
