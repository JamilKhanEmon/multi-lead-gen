from typing import Set
from app.core.logging import logger

class ParameterEngine:

    ALL_PARAMETERS: Set[int] = set(range(1, 136))

    @classmethod
    def get_active_parameters(cls, business_type: str) -> Set[int]:
        return cls.ALL_PARAMETERS

    @classmethod
    def is_parameter_active(cls, business_type: str, parameter_id: int) -> bool:
        return parameter_id in cls.ALL_PARAMETERS

    @staticmethod
    def validate_detection_type(detection_type: str, status: str, has_direct_evidence: bool) -> str:
        if detection_type == "INTERNAL":
            return "UNKNOWN"

        if not has_direct_evidence:
            return "NOT_VERIFIED"

        return status
