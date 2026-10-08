import uuid
from typing import Optional
from sqlalchemy import String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, UUIDMixin

class EmailTemplate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "email_templates"

    name: Mapped[str] = mapped_column(String(100), unique=True, default="default", nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    sender_name: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    sender_title: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    sender_company: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    sender_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    sender_phone: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    sender_website: Mapped[Optional[str]] = mapped_column(String(255), default="", nullable=True)
    sign_off: Mapped[str] = mapped_column(String(100), default="Sincerely,", nullable=False)
    signature_text: Mapped[Optional[str]] = mapped_column(Text, default="", nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def render_signature(self) -> str:
        if self.signature_text and self.signature_text.strip():
            return self.signature_text.strip()
        
        parts = []
        if self.sign_off:
            parts.append(self.sign_off)
        name_line = self.sender_name or ""
        if self.sender_title:
            name_line = f"{name_line}\n{self.sender_title}".strip()
        if self.sender_company:
            name_line = f"{name_line}, {self.sender_company}".strip(", ")
        if name_line:
            parts.append(name_line)

        contact_line = []
        if self.sender_email:
            contact_line.append(f"Email: {self.sender_email}")
        if self.sender_phone:
            contact_line.append(f"Phone: {self.sender_phone}")
        if contact_line:
            parts.append(" | ".join(contact_line))

        if self.sender_website:
            parts.append(self.sender_website)

        return "\n".join(parts).strip()

class SMTPInbox(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "smtp_inboxes"

    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(default=587, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    from_email: Mapped[str] = mapped_column(String(255), nullable=False)
    from_name: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    daily_limit: Mapped[int] = mapped_column(default=30, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

class PersonaSignature(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "persona_signatures"

    title: Mapped[str] = mapped_column(String(150), default="Primary Signature", nullable=False)
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    company: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def render_signature(self) -> str:
        if self.raw_content and self.raw_content.strip():
            return self.raw_content.strip()
        parts = []
        if self.name:
            parts.append(self.name)
        if self.title:
            parts.append(self.title)
        if self.company:
            parts.append(self.company)
        return "\n".join(parts)

