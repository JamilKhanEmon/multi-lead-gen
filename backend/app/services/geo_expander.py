"""
Dynamic Search Query Builder for OpenClaw.
Generates targeted, natural web queries dynamically from user-provided industry and location
without any hardcoded cities, districts, or business data.
"""
from typing import List
from app.core.logging import logger


class GeoExpander:
    """Dynamically builds targeted search queries based purely on user input."""

    @classmethod
    def build_search_queries(cls, industry: str, location: str) -> List[str]:
        """
        Dynamically formats search queries for OpenClaw web search.
        Purely dynamic: no hardcoded locations, cities, or business categories.
        """
        loc_clean = location.strip()
        ind_clean = industry.strip()

        if not loc_clean:
            return [
                f"{ind_clean} companies",
                f"top {ind_clean} companies",
                f"{ind_clean} services",
                f"{ind_clean} directory",
            ]

        # Natural web search queries based purely on whatever user input was provided
        queries = [
            f"{ind_clean} in {loc_clean}",
            f"{ind_clean} companies in {loc_clean}",
            f"top {ind_clean} in {loc_clean}",
            f"{ind_clean} services {loc_clean}",
            f"{ind_clean} directory {loc_clean}",
            f"best {ind_clean} {loc_clean}",
        ]

        logger.info(f"GeoExpander: Built {len(queries)} dynamic search queries for '{ind_clean}' in '{loc_clean}'.")
        return queries
