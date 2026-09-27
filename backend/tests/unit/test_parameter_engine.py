"""
Unit Tests for Parameter Engine
"""
import pytest
from app.engine.parameter_engine import ParameterEngine


def test_construction_active_parameters():
    active = ParameterEngine.get_active_parameters("construction")
    # Website portfolio (47), WhatsApp (43), Project updates (101) must be active
    assert 47 in active
    assert 43 in active
    assert 101 in active


def test_real_estate_active_parameters():
    active = ParameterEngine.get_active_parameters("real_estate")
    # Property presentation (121), WhatsApp (43), Ads (24) must be active
    assert 121 in active
    assert 43 in active
    assert 24 in active


def test_internal_parameter_detection_rule():
    # Rule: INTERNAL parameter cannot be confirmed publicly -> returns UNKNOWN
    status = ParameterEngine.validate_detection_type(
        detection_type="INTERNAL",
        status="STRONG",
        has_direct_evidence=True,
    )
    assert status == "UNKNOWN"

    # OBSERVABLE without direct evidence -> NOT_VERIFIED
    status_obs = ParameterEngine.validate_detection_type(
        detection_type="OBSERVABLE",
        status="STRONG",
        has_direct_evidence=False,
    )
    assert status_obs == "NOT_VERIFIED"
