import pytest
from app.engine.parameter_engine import ParameterEngine

def test_construction_active_parameters():
    active = ParameterEngine.get_active_parameters("construction")
    assert 47 in active
    assert 43 in active
    assert 101 in active

def test_real_estate_active_parameters():
    active = ParameterEngine.get_active_parameters("real_estate")
    assert 121 in active
    assert 43 in active
    assert 24 in active

def test_internal_parameter_detection_rule():
    status = ParameterEngine.validate_detection_type(
        detection_type="INTERNAL",
        status="STRONG",
        has_direct_evidence=True,
    )
    assert status == "UNKNOWN"

    status_obs = ParameterEngine.validate_detection_type(
        detection_type="OBSERVABLE",
        status="STRONG",
        has_direct_evidence=False,
    )
    assert status_obs == "NOT_VERIFIED"
