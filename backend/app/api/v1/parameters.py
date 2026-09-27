"""
135 Parameter Catalog Endpoints
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.api.deps import get_db, get_current_user
from app.models.parameter import Parameter
from app.models.audit import User
from app.schemas.parameter import ParameterResponse

router = APIRouter(prefix="/parameters", tags=["Parameters"])


@router.get("", response_model=List[ParameterResponse])
async def list_parameters(
    category: Optional[str] = None,
    detection_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve full catalog of 135 parameters."""
    stmt = select(Parameter)
    if category:
        stmt = stmt.where(Parameter.category == category)
    if detection_type:
        stmt = stmt.where(Parameter.detection_type == detection_type.upper())

    stmt = stmt.order_by(Parameter.id.asc())
    res = await db.execute(stmt)
    return res.scalars().all()
