import pytest
from unittest.mock import AsyncMock, patch
from app.engine.strategy_engine import StrategyEngine
from app.services.ai_client import AIClient, MockAIClient

@pytest.mark.asyncio
async def test_decompose_sub_areas_dynamic_llm():
    mock_ai = MockAIClient(return_payload={
        "sub_areas": ["Tangail Sadar", "Mirzapur", "Madhupur", "Kalihati", "Ghatail"]
    })
    areas = await StrategyEngine.decompose_sub_areas("Tangail", industry="Garments", ai_client=mock_ai)
    names = [a["name"] for a in areas]
    assert "Tangail Sadar" in names
    assert "Mirzapur" in names
    assert len(areas) == 5

@pytest.mark.asyncio
async def test_decompose_sub_areas_zero_token_cache():
    # Calling twice should hit the in-memory cache and not invoke LLM again
    mock_ai = AsyncMock()
    mock_ai.analyze.return_value = {
        "sub_areas": ["Downtown", "Uptown", "Midtown"]
    }
    # First call
    areas1 = await StrategyEngine.decompose_sub_areas("UniqueTestCity", industry="Tech", ai_client=mock_ai)
    assert len(areas1) == 3
    assert mock_ai.analyze.call_count == 1

    # Second call (must be zero tokens, cache hit)
    areas2 = await StrategyEngine.decompose_sub_areas("UniqueTestCity", industry="Tech", ai_client=mock_ai)
    assert len(areas2) == 3
    assert mock_ai.analyze.call_count == 1  # Not called again!

@pytest.mark.asyncio
async def test_generate_search_queries_with_micro_areas():
    sub_areas = ["Gulshan", "Banani", "Uttara"]
    queries = StrategyEngine.generate_search_queries("Real Estate", "Dhaka", sub_areas)
    assert any("Gulshan" in q for q in queries)
    assert any("site:facebook.com" in q for q in queries)
