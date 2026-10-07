import re
import socket
import asyncio
from typing import Tuple, Optional

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
        domain = domain.strip().lower()
        loop = asyncio.get_running_loop()
        
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
        if not email or not email.strip():
            return "NEEDS_REVIEW", "Email address missing from business discovery"

        email = email.strip()

        if not cls.verify_syntax(email):
            return "INVALID", f"Invalid email format syntax: {email}"

        parts = email.split("@")
        if len(parts) != 2:
            return "INVALID", "Malformed email structure"

        user_part, domain = parts[0], parts[1]

        if cls.is_disposable(domain):
            return "INVALID", f"Disposable or temporary email domain: {domain}"

        has_mx, note = await cls.check_domain_mx(domain)
        if not has_mx:
            return "INVALID", f"Unreachable domain: {note}"

        is_role_based = user_part.lower() in {"admin", "support", "billing", "careers", "jobs", "privacy"}
        if is_role_based:
            return "NEEDS_REVIEW", f"Generic role-based inbox ({user_part}@) - review before cold outreach"

        return "VALID", f"100% verified inbox ({note})"
