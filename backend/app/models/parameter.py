from typing import List, Optional
from sqlalchemy import String, Text, Float, Integer, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin, UUIDMixin

class Parameter(Base, TimestampMixin):
    __tablename__ = "parameters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    detection_type: Mapped[str] = mapped_column(String(50), nullable=False)
    default_weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    business_type_mappings: Mapped[List["BusinessTypeParameter"]] = relationship("BusinessTypeParameter", back_populates="parameter")
    evidence_items: Mapped[List["Evidence"]] = relationship("Evidence", back_populates="parameter")

    __table_args__ = (
        Index("idx_parameter_category", "category"),
        Index("idx_parameter_detection", "detection_type"),
    )

class BusinessType(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "business_types"

    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    parameter_mappings: Mapped[List["BusinessTypeParameter"]] = relationship("BusinessTypeParameter", back_populates="business_type")

class BusinessTypeParameter(Base, TimestampMixin):
    __tablename__ = "business_type_parameters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    business_type_slug: Mapped[str] = mapped_column(String(100), ForeignKey("business_types.slug", ondelete="CASCADE"), nullable=False, index=True)
    parameter_id: Mapped[int] = mapped_column(Integer, ForeignKey("parameters.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    weight_multiplier: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)

    business_type: Mapped["BusinessType"] = relationship("BusinessType", back_populates="parameter_mappings")
    parameter: Mapped["Parameter"] = relationship("Parameter", back_populates="business_type_mappings")
