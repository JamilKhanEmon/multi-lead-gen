from typing import List
from app.core.logging import logger

class GeoExpander:

    @classmethod
    def build_search_queries(cls, industry: str, location: str) -> List[str]:
        loc_clean = location.strip()
        ind_clean = industry.strip()

        if not loc_clean:
            return [
                f"{ind_clean} companies",
                f"{ind_clean} business directory",
                f"{ind_clean} services",
                f"{ind_clean} local offices",
            ]

        queries = [
            f"{ind_clean} in {loc_clean}",
            f"{ind_clean} companies in {loc_clean}",
            f"{ind_clean} local offices {loc_clean}",
            f"{ind_clean} services {loc_clean}",
            f"{ind_clean} business directory {loc_clean}",
            f"{ind_clean} commercial firms {loc_clean}",
        ]

        logger.info(f"GeoExpander: Built {len(queries)} dynamic search queries for '{ind_clean}' in '{loc_clean}'.")
        return queries
