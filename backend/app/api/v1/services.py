from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.api.deps import get_db, get_current_user
from app.models.service import Service
from app.models.audit import User
from app.schemas.service import ServiceResponse

router = APIRouter(prefix="/services", tags=["Services"])

@router.get("", response_model=List[ServiceResponse])
async def list_services(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Service).where(Service.is_active == True)
    if category:
        stmt = stmt.where(Service.category == category)

    stmt = stmt.order_by(Service.name.asc())
    res = await db.execute(stmt)
    return res.scalars().all()
