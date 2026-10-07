import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc
from app.api.deps import get_db, get_current_user
from app.models.business import Business
from app.models.audit import User
from app.schemas.business import BusinessResponse

router = APIRouter(prefix="/businesses", tags=["Businesses"])

@router.get("", response_model=List[BusinessResponse])
async def list_businesses(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    business_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Business).options(selectinload(Business.locations))

    if search:
        stmt = stmt.where(Business.canonical_name.ilike(f"%{search}%"))
    if business_type:
        stmt = stmt.where(Business.business_type == business_type)

    stmt = stmt.order_by(desc(Business.created_at)).offset(skip).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/{business_id}", response_model=BusinessResponse)
async def get_business(
    business_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Business).options(selectinload(Business.locations)).where(Business.id == business_id)
    res = await db.execute(stmt)
    biz = res.scalar_one_or_none()
    if not biz:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return biz
