import re
from typing import Optional, Tuple
from urllib.parse import urlparse

CORPORATE_SUFFIXES = [
    r"\bltd\b", r"\blimited\b", r"\binc\b", r"\bincorporated\b",
    r"\bcorp\b", r"\bcorporation\b", r"\bco\b", r"\bcompany\b",
    r"\bllc\b", r"\bpvt\b", r"\bprivate\b", r"\bgroup\b"
]

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

    @staticmethod
    def is_generic_platform(url_or_domain: Optional[str]) -> bool:
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
        cleaned = cleaned.split("/")[0].split(":")[0]
        if cleaned in GENERIC_PLATFORM_DOMAINS:
            return True
        for plat in GENERIC_PLATFORM_DOMAINS:
            if cleaned == plat or cleaned.endswith("." + plat):
                return True
        return False

    @staticmethod
    def normalize_name(name: str) -> str:
        import unicodedata
        if not name:
            return ""
        cleaned = unicodedata.normalize("NFKC", name).lower().strip()
        cleaned = re.sub(r"[^\w\s]", " ", cleaned)
        for suffix in CORPORATE_SUFFIXES:
            cleaned = re.sub(suffix, "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    @classmethod
    def normalize_domain(cls, url: Optional[str]) -> Optional[str]:
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
            if cls.is_generic_platform(netloc):
                return None
            return netloc
        except Exception:
            return None

    @staticmethod
    def normalize_phone(phone: Optional[str]) -> Optional[str]:
        if not phone:
            return None
        cleaned = re.sub(r"[^\d+]", "", phone)
        if cleaned.startswith("+880"):
            cleaned = "0" + cleaned[4:]
        elif cleaned.startswith("880"):
            cleaned = "0" + cleaned[3:]
        return cleaned if len(cleaned) >= 7 else None

    @staticmethod
    def normalize_phone_last10(phone: Optional[str]) -> Optional[str]:
        if not phone:
            return None
        digits = re.sub(r"\D", "", phone)
        if len(digits) >= 10:
            return digits[-10:]
        elif len(digits) >= 7:
            return digits
        return None

    @classmethod
    def are_duplicate_candidates(
        cls,
        name1: str, domain1: Optional[str], phone1: Optional[str],
        name2: str, domain2: Optional[str], phone2: Optional[str],
    ) -> Tuple[bool, str]:
        import difflib

        d1 = cls.normalize_domain(domain1)
        d2 = cls.normalize_domain(domain2)
        if d1 and d2 and d1 == d2:
            return True, f"Identical verified domain: {d1}"

        p1_10 = cls.normalize_phone_last10(phone1)
        p2_10 = cls.normalize_phone_last10(phone2)
        if p1_10 and p2_10 and p1_10 == p2_10:
            return True, f"Identical phone digits: {p1_10}"

        n1 = cls.normalize_name(name1)
        n2 = cls.normalize_name(name2)
        if n1 and n2:
            if n1 == n2:
                return True, f"Identical canonical name: '{n1}'"
            sim = difflib.SequenceMatcher(None, n1, n2).ratio()
            if sim >= 0.90:
                return True, f"High name similarity ({int(sim*100)}%): '{n1}' ~= '{n2}'"

        return False, "Distinct business entities"

