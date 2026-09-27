"""
Business Types Catalog Endpoints
"""
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.api.deps import get_db, get_current_user
from app.models.parameter import BusinessType
from app.models.audit import User
from app.schemas.parameter import BusinessTypeResponse

router = APIRouter(prefix="/business-types", tags=["Business Types"])


@router.get("", response_model=List[BusinessTypeResponse])
async def list_business_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all classified business types."""
    stmt = select(BusinessType).order_by(BusinessType.display_name.asc())
    res = await db.execute(stmt)
    return res.scalars().all()
