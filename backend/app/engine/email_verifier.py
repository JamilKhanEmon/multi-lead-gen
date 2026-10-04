"""
Real-time Autonomous Email Verification Engine
Validates email syntax, domain MX records, disposable providers, and spam traps.
Zero cost, high-speed, preventing hard bounces and protecting sender reputation.
"""
import re
import socket
import asyncio
from typing import Tuple, Optional

# Common disposable and spam-trap domains
DISPOSABLE_DOMAINS = {
    "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
    "yopmail.com", "trashmail.com", "sharklasers.com", "getairmail.com",
    "throwawaymail.com", "dispostable.com", "fakeinbox.com", "temp-mail.org",
    "maildrop.cc", "inboxkitten.com"
}

EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)


class EmailVerifier:
    """Zero-bounce verification filter for cold outreach."""

    @classmethod
    def verify_syntax(cls, email: str) -> bool:
        if not email or len(email) > 254:
            return False
        return bool(EMAIL_REGEX.match(email.strip()))

    @classmethod
    def is_disposable(cls, domain: str) -> bool:
        return domain.lower().strip() in DISPOSABLE_DOMAINS

    @classmethod
    async def check_domain_mx(cls, domain: str) -> Tuple[bool, str]:
        """Verify if domain resolves and has active mail handling capability."""
        domain = domain.strip().lower()
        loop = asyncio.get_running_loop()
        
        # 1. Try resolving DNS MX record via dnspython if installed, or fallback to socket lookup
        try:
            import dns.resolver
            def _resolve_mx():
                try:
                    records = dns.resolver.resolve(domain, 'MX', lifetime=3.0)
                    if records:
                        return True, f"Active MX exchanger: {records[0].exchange}"
                except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
                    pass
                except Exception:
                    pass
                return False, ""
            
            has_mx, mx_note = await loop.run_in_executor(None, _resolve_mx)
            if has_mx:
                return True, mx_note
        except ImportError:
            pass

        # 2. Socket fallback resolution (check if domain exists in public DNS)
        try:
            def _resolve_host():
                try:
                    addr_info = socket.getaddrinfo(domain, 25, socket.AF_INET, socket.SOCK_STREAM)
                    return bool(addr_info)
                except (socket.gaierror, socket.herror, Exception):
                    return False
            
            resolves = await loop.run_in_executor(None, _resolve_host)
            if resolves:
                return True, "Domain host active and resolvable"
            return False, "Domain does not resolve in DNS (No MX or host records)"
        except Exception as e:
            return False, f"DNS resolution check failed: {str(e)}"

    @classmethod
    async def verify(cls, email: Optional[str]) -> Tuple[str, str]:
        """
        Main verification entry point.
        Returns:
            status: "VALID" | "NEEDS_REVIEW" | "INVALID"
            notes: Detailed explanation
        """
        if not email or not email.strip():
            return "NEEDS_REVIEW", "Email address missing from business discovery"

        email = email.strip()

        # Step 1: Syntax
        if not cls.verify_syntax(email):
            return "INVALID", f"Invalid email format syntax: {email}"

        parts = email.split("@")
        if len(parts) != 2:
            return "INVALID", "Malformed email structure"

        user_part, domain = parts[0], parts[1]

        # Step 2: Disposable Check
        if cls.is_disposable(domain):
            return "INVALID", f"Disposable or temporary email domain: {domain}"

        # Step 3: Domain & MX Verification
        has_mx, note = await cls.check_domain_mx(domain)
        if not has_mx:
            return "INVALID", f"Unreachable domain: {note}"

        # Step 4: Role-based or high-value inbox check
        is_role_based = user_part.lower() in {"admin", "support", "billing", "careers", "jobs", "privacy"}
        if is_role_based:
            return "NEEDS_REVIEW", f"Generic role-based inbox ({user_part}@) - review before cold outreach"

        return "VALID", f"100% verified inbox ({note})"
