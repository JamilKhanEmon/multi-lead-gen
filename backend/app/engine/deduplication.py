"""
Business Identity Deduplication Engine
Normalizes company names, domains, phone numbers, and addresses to resolve
multiple public listings into a single canonical business entity.
"""
import re
from typing import Optional, Tuple
from urllib.parse import urlparse

# Standard corporate suffixes to strip during canonicalization
CORPORATE_SUFFIXES = [
    r"\bltd\b", r"\blimited\b", r"\binc\b", r"\bincorporated\b",
    r"\bcorp\b", r"\bcorporation\b", r"\bco\b", r"\bcompany\b",
    r"\bllc\b", r"\bpvt\b", r"\bprivate\b", r"\bgroup\b"
]

# Generic platform / social network domains that must NEVER be treated as a business's official website domain
GENERIC_PLATFORM_DOMAINS = {
    "facebook.com", "m.facebook.com", "fb.com", "fb.watch", "web.facebook.com",
    "instagram.com", "instagr.am",
    "twitter.com", "x.com", "t.co",
    "linkedin.com", "lnkd.in",
    "youtube.com", "youtu.be",
    "tiktok.com",
    "pinterest.com",
    "reddit.com",
    "google.com", "maps.google.com", "goo.gl", "g.page", "g.co",
    "wikipedia.org", "wikimedia.org",
    "yellowpages.com", "yellowpages.ca", "yelp.com",
    "apple.com", "microsoft.com", "github.com",
    "whatsapp.com", "wa.me", "telegram.org", "t.me",
    "yahoo.com", "bing.com", "duckduckgo.com"
}


class DeduplicationEngine:
    """Computes normalized fingerprints for business deduplication."""

    @staticmethod
    def is_generic_platform(url_or_domain: Optional[str]) -> bool:
        """Returns True if the domain/URL is an official social platform or search engine, not a business website."""
        if not url_or_domain:
            return False
        cleaned = url_or_domain.lower().strip()
        if cleaned.startswith(("http://", "https://")):
            try:
                cleaned = urlparse(cleaned).netloc
            except Exception:
                pass
        if cleaned.startswith("www."):
            cleaned = cleaned[4:]
        # Remove any path/query if present
        cleaned = cleaned.split("/")[0].split(":")[0]
        if cleaned in GENERIC_PLATFORM_DOMAINS:
            return True
        for plat in GENERIC_PLATFORM_DOMAINS:
            if cleaned == plat or cleaned.endswith("." + plat):
                return True
        return False

    @staticmethod
    def normalize_name(name: str) -> str:
        """Removes punctuation, corporate suffixes, and excess spaces."""
        cleaned = name.lower().strip()
        # Remove punctuation
        cleaned = re.sub(r"[^\w\s]", " ", cleaned)
        # Remove corporate suffixes
        for suffix in CORPORATE_SUFFIXES:
            cleaned = re.sub(suffix, "", cleaned)
        # Normalize whitespace
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    @classmethod
    def normalize_domain(cls, url: Optional[str]) -> Optional[str]:
        """Extracts canonical domain name from URL. Rejects generic social networks and search engines."""
        if not url:
            return None
        cleaned = url.lower().strip()
        if not cleaned.startswith(("http://", "https://")):
            cleaned = "https://" + cleaned
        try:
            parsed = urlparse(cleaned)
            netloc = parsed.netloc
            if netloc.startswith("www."):
                netloc = netloc[4:]
            if ":" in netloc:
                netloc = netloc.split(":")[0]
            if "." not in netloc:
                return None
            # Reject generic platforms (facebook.com, instagram.com, etc.)
            if cls.is_generic_platform(netloc):
                return None
            return netloc
        except Exception:
            return None

    @staticmethod
    def normalize_phone(phone: Optional[str]) -> Optional[str]:
        """Strips formatting and standardizes phone digits."""
        if not phone:
            return None
        # Keep digits and leading +
        cleaned = re.sub(r"[^\d+]", "", phone)
        # Remove leading country codes if local formatting matches
        if cleaned.startswith("+880"):
            cleaned = "0" + cleaned[4:]
        elif cleaned.startswith("880"):
            cleaned = "0" + cleaned[3:]
        return cleaned if len(cleaned) >= 7 else None

    @classmethod
    def are_duplicate_candidates(
        cls,
        name1: str, domain1: Optional[str], phone1: Optional[str],
        name2: str, domain2: Optional[str], phone2: Optional[str],
    ) -> Tuple[bool, str]:
        """
        Determines if two business records refer to the same canonical entity.
        Returns: (is_duplicate: bool, reason: str)
        """
        d1 = cls.normalize_domain(domain1)
        d2 = cls.normalize_domain(domain2)
        if d1 and d2 and d1 == d2:
            return True, f"Identical verified domain: {d1}"

        p1 = cls.normalize_phone(phone1)
        p2 = cls.normalize_phone(phone2)
        if p1 and p2 and p1 == p2:
            return True, f"Identical verified phone number: {p1}"

        n1 = cls.normalize_name(name1)
        n2 = cls.normalize_name(name2)
        if n1 and n2 and n1 == n2:
            return True, f"Identical canonical name: '{n1}'"

        return False, "Distinct business entities"
