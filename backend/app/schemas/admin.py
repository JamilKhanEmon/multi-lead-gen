"""
System Health & Admin Monitoring Schemas
"""
from typing import Dict, Any, Optional
from pydantic import BaseModel


class ComponentHealth(BaseModel):
    status: str  # healthy, degraded, down
    latency_ms: Optional[float] = None
    details: Optional[Dict[str, Any]] = None


class SystemHealthResponse(BaseModel):
    status: str  # healthy, degraded, down
    components: Dict[str, ComponentHealth]


class SystemMetricsResponse(BaseModel):
    queue_depth: int
    active_runs: int
    total_leads: int
    qualified_leads: int
    worker_concurrency: int
