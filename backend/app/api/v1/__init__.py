from fastapi import APIRouter
from .auth import router as auth_router
from .research import router as research_router
from .businesses import router as businesses_router
from .leads import router as leads_router
from .parameters import router as parameters_router
from .services import router as services_router
from .business_types import router as business_types_router
from .admin import router as admin_router
from .webhooks import router as webhooks_router
from .campaigns import router as campaigns_router
from .voice_agent import router as voice_agent_router
from .autopilot import router as autopilot_router

api_v1_router = APIRouter()

api_v1_router.include_router(auth_router)
api_v1_router.include_router(research_router)
api_v1_router.include_router(businesses_router)
api_v1_router.include_router(leads_router)
api_v1_router.include_router(parameters_router)
api_v1_router.include_router(services_router)
api_v1_router.include_router(business_types_router)
api_v1_router.include_router(admin_router)
api_v1_router.include_router(webhooks_router)
api_v1_router.include_router(campaigns_router)
api_v1_router.include_router(voice_agent_router)
api_v1_router.include_router(autopilot_router)

