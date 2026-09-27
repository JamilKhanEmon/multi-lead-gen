"""
Parameter Engine: Evaluates parameter applicability dynamically for any business category.
Enforces OBSERVABLE / INFERABLE / INTERNAL detection rules without hardcoded business constraints.
"""
from typing import Set
from app.core.logging import logger


class ParameterEngine:
    """Evaluates parameter applicability dynamically for any custom business type."""

    # Full parameter range (135 parameters) applicable dynamically across all commercial categories
    ALL_PARAMETERS: Set[int] = set(range(1, 136))

    @classmethod
    def get_active_parameters(cls, business_type: str) -> Set[int]:
        """
        Returns the set of parameter IDs active for the given business type.
        Fully dynamic: applies to any custom niche or business type freely.
        """
        return cls.ALL_PARAMETERS

    @classmethod
    def is_parameter_active(cls, business_type: str, parameter_id: int) -> bool:
        """Checks if a specific parameter is active for a business type."""
        return parameter_id in cls.ALL_PARAMETERS

    @staticmethod
    def validate_detection_type(detection_type: str, status: str, has_direct_evidence: bool) -> str:
        """
        Enforces rule: INTERNAL parameters cannot be confirmed from public data.
        Returns validated status.
        """
        if detection_type == "INTERNAL":
            # Rule: Never hallucinate internal facts (e.g. actual CRM usage)
            return "UNKNOWN"

        if not has_direct_evidence:
            return "NOT_VERIFIED"

        return status
