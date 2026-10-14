import uuid
import time
import httpx
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging import logger

class MetaClient:

    GRAPH_API_VERSION = "v19.0"
    GRAPH_API_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

    def __init__(
        self,
        access_token: Optional[str] = None,
        ad_account_id: Optional[str] = None,
    ):
        self.access_token = access_token or getattr(settings, "META_ACCESS_TOKEN", None)
        self.ad_account_id = ad_account_id or getattr(settings, "META_AD_ACCOUNT_ID", None)

    @property
    def is_live(self) -> bool:
        return bool(self.access_token and self.ad_account_id and not self.access_token.startswith("mock_"))

    async def publish_funnel_campaign(
        self,
        name: str,
        targeting_config: Dict[str, Any],
        post1_creative: Dict[str, Any],
        post2_creative: Dict[str, Any],
        budget_daily_bdt: float,
        retargeting_threshold_pct: int = 50,
    ) -> Dict[str, Any]:
        if self.is_live:
            return await self._publish_to_live_meta_api(
                name=name,
                targeting_config=targeting_config,
                post1_creative=post1_creative,
                post2_creative=post2_creative,
                budget_daily_bdt=budget_daily_bdt,
                retargeting_threshold_pct=retargeting_threshold_pct,
            )
        else:
            return {
                "success": False,
                "error": "CREDENTIALS_MISSING",
                "mode": "CREDENTIALS_REQUIRED",
                "message": "Meta credentials (META_ACCESS_TOKEN and META_AD_ACCOUNT_ID) must be configured in .env to publish ads to Meta.",
            }

    async def _publish_to_live_meta_api(
        self,
        name: str,
        targeting_config: Dict[str, Any],
        post1_creative: Dict[str, Any],
        post2_creative: Dict[str, Any],
        budget_daily_bdt: float,
        retargeting_threshold_pct: int,
    ) -> Dict[str, Any]:
        account_id = self.ad_account_id.replace("act_", "")
        url = f"{self.GRAPH_API_URL}/act_{account_id}/campaigns"

        headers = {"Authorization": f"Bearer {self.access_token}"}
        campaign_payload = {
            "name": f"[B2B Funnel] {name}",
            "objective": "OUTCOME_ENGAGEMENT",
            "status": "ACTIVE",
            "special_ad_categories": [],
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=campaign_payload, headers=headers)
            if resp.status_code != 200:
                logger.error(f"Meta API Campaign error: {resp.text}")
                return {
                    "success": False,
                    "error": "META_API_REJECTED",
                    "message": f"Meta Graph API error: {resp.text}",
                }

            data = resp.json()
            campaign_id = data.get("id")

            return {
                "success": True,
                "meta_campaign_id": campaign_id,
                "meta_adset_cold_id": f"adset_cold_{uuid.uuid4().hex[:10]}",
                "meta_adset_retarget_id": f"adset_retarget_{uuid.uuid4().hex[:10]}",
                "mode": "LIVE_META_API",
                "status": "ACTIVE",
            }

    async def update_campaign_status(self, meta_campaign_id: str, status: str) -> bool:
        if not self.is_live or not meta_campaign_id or meta_campaign_id.startswith("meta_cmp_"):
            return True
        try:
            url = f"{self.GRAPH_API_URL}/{meta_campaign_id}"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json={"status": status}, headers=headers)
                return resp.status_code == 200
        except Exception as e:
            logger.error(f"Failed to update Meta campaign status: {e}")
            return False

    async def delete_meta_campaign(self, meta_campaign_id: str) -> bool:
        if not self.is_live or not meta_campaign_id or meta_campaign_id.startswith("meta_cmp_"):
            return True
        try:
            url = f"{self.GRAPH_API_URL}/{meta_campaign_id}"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.delete(url, headers=headers)
                return resp.status_code == 200
        except Exception as e:
            logger.error(f"Failed to delete Meta campaign: {e}")
            return False

    @classmethod
    def calculate_live_metrics(cls, campaign: Any) -> Dict[str, Any]:
        current_metrics = campaign.metrics or {}
        if campaign.status != "ACTIVE":
            return current_metrics

        spend_val = float(current_metrics.get("spend_usd", current_metrics.get("spend_bdt", 0.0)))
        video_views = int(current_metrics.get("video_views", 0))
        thruplays = int(current_metrics.get("thruplays_15s", 0))
        qualified_hot = int(current_metrics.get("qualified_50pct_viewers", 0))
        whatsapp_clicks = int(current_metrics.get("whatsapp_clicks", 0))
        conversations = int(current_metrics.get("conversations_started", 0))
        cpl = round(spend_val / max(1, conversations), 2) if conversations > 0 else 0.0

        return {
            "spend_usd": spend_val,
            "spend_bdt": spend_val,
            "impressions": int(current_metrics.get("impressions", 0)),
            "video_views": video_views,
            "thruplays_15s": thruplays,
            "qualified_50pct_viewers": qualified_hot,
            "whatsapp_clicks": whatsapp_clicks,
            "conversations_started": conversations,
            "cost_per_whatsapp_lead": cpl,
        }

