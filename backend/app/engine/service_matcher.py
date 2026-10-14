from typing import Dict, List, Any, Optional
from app.core.logging import logger

PARAMETER_SERVICE_RULES: Dict[int, List[Dict[str, Any]]] = {
    5: [
        {"service_slug": "digital-marketing", "rule_score": 0.9, "reason": "No Meta Pixel detected; unable to retarget past web visitors."},
    ],
    34: [
        {"service_slug": "website-development", "rule_score": 1.0, "reason": "No accessible website found; brand requires new web presence."},
    ],
    36: [
        {"service_slug": "website-modernization", "rule_score": 0.9, "reason": "Outdated UI/UX design requires modern web redesign."},
    ],
    37: [
        {"service_slug": "website-modernization", "rule_score": 1.0, "reason": "Fails mobile responsiveness; critical need for mobile viewport optimization."},
    ],
    38: [
        {"service_slug": "website-modernization", "rule_score": 0.8, "reason": "Slow page speed requires code optimization and performance engineering."},
    ],
    42: [
        {"service_slug": "website-modernization", "rule_score": 0.8, "reason": "Missing or broken contact form restricts customer inquiries."},
        {"service_slug": "crm", "rule_score": 0.8, "reason": "Lead capture form integration needed for customer pipeline management."},
    ],
    43: [
        {"service_slug": "whatsapp-automation", "rule_score": 1.0, "reason": "Lack of WhatsApp integration creates contact friction for mobile users."},
    ],
    44: [
        {"service_slug": "booking-systems", "rule_score": 1.0, "reason": "Absence of online booking creates manual phone/scheduling delays."},
        {"service_slug": "whatsapp-automation", "rule_score": 0.7, "reason": "WhatsApp automated appointment booking can resolve scheduling friction."},
    ],
    45: [
        {"service_slug": "ordering-systems", "rule_score": 1.0, "reason": "Online ordering platform needed for automated order processing."},
        {"service_slug": "e-commerce", "rule_score": 0.9, "reason": "Digital storefront integration required."},
    ],
    46: [
        {"service_slug": "payment-integration", "rule_score": 1.0, "reason": "Digital payment gateway integration needed to accept online transactions."},
    ],
    47: [
        {"service_slug": "digital-marketing", "rule_score": 0.9, "reason": "No Google Analytics tracking detected; unable to measure search and visitor conversions."},
    ],
    54: [
        {"service_slug": "ai-customer-support", "rule_score": 0.9, "reason": "Repeated customer complaints regarding slow response time."},
        {"service_slug": "ai-chatbot", "rule_score": 0.8, "reason": "24/7 AI conversational agent can address instant customer questions."},
    ],
    59: [
        {"service_slug": "social-automation", "rule_score": 0.8, "reason": "Unanswered reviews and comments require automated notifications and replies."},
        {"service_slug": "ai-customer-support", "rule_score": 0.8, "reason": "Automated response workflows can prevent unaddressed public queries."},
    ],
    81: [
        {"service_slug": "crm", "rule_score": 0.9, "reason": "Manual lead collection causes lead leakage; requires CRM implementation."},
        {"service_slug": "workflow-automation", "rule_score": 0.9, "reason": "Automated pipeline workflows to capture and assign web leads."},
    ],
    83: [
        {"service_slug": "booking-systems", "rule_score": 1.0, "reason": "Manual appointment handling causes booking delays."},
    ],
    102: [
        {"service_slug": "security-improvement", "rule_score": 1.0, "reason": "Missing SSL certificate / HTTPS requires immediate security remediation."},
    ],
}

class ServiceMatcher:

    MATCH_THRESHOLD = 0.65

    @classmethod
    def match_services(
        cls,
        detected_parameter_ids: List[int],
        llm_service_suggestions: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        llm_map: Dict[str, Dict[str, Any]] = {}
        if llm_service_suggestions:
            for s in llm_service_suggestions:
                slug = s.get("service_id", s.get("service_slug", "")).lower()
                llm_map[slug] = s

        matched_services: Dict[str, Dict[str, Any]] = {}

        for pid in detected_parameter_ids:
            rules = PARAMETER_SERVICE_RULES.get(pid, [])
            for r in rules:
                slug = r["service_slug"]
                rule_score = r["rule_score"]
                rationale = r["reason"]

                if slug not in matched_services:
                    matched_services[slug] = {
                        "service_slug": slug,
                        "rule_score": rule_score,
                        "llm_score": 0.0,
                        "hybrid_score": 0.0,
                        "rationales": [rationale],
                    }
                else:
                    matched_services[slug]["rule_score"] = max(matched_services[slug]["rule_score"], rule_score)
                    matched_services[slug]["rationales"].append(rationale)

        for slug, item in list(matched_services.items()):
            llm_item = llm_map.get(slug)
            llm_score = llm_item.get("confidence", 0.5) if llm_item else 0.5
            item["llm_score"] = llm_score
            hybrid = round((0.40 * item["rule_score"]) + (0.60 * llm_score), 2)
            item["hybrid_score"] = hybrid

        for slug, llm_item in llm_map.items():
            if slug not in matched_services and slug:
                llm_score = llm_item.get("confidence", 0.0)
                hybrid = round(0.60 * llm_score, 2)
                matched_services[slug] = {
                    "service_slug": slug,
                    "rule_score": 0.0,
                    "llm_score": llm_score,
                    "hybrid_score": hybrid,
                    "rationales": [llm_item.get("reason", "Suggested by AI semantic reasoning.")],
                }

        results = [
            s for s in matched_services.values() if s["hybrid_score"] >= cls.MATCH_THRESHOLD
        ]
        results.sort(key=lambda x: x["hybrid_score"], reverse=True)
        return results
