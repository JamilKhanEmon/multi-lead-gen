import asyncio
import json
import random
import signal
import sys
from typing import Dict, Any
import redis.asyncio as aioredis
from app.core.config import settings
from app.core.logging import logger
from app.services.openclaw_client import OpenClawClient
from app.services.ai_client import AIClient
from app.workers.tasks import (
    handle_discover_businesses,
    handle_research_and_qualify,
    handle_autopilot_campaign_run,
)

BACKOFF_STEPS = [2, 4, 8, 16, 32]

class WorkerRunner:

    def __init__(self):
        self.running = True
        self.openclaw_client = OpenClawClient()
        self.ai_client = AIClient()

    def stop(self):
        logger.info("Worker runner received stop signal. Finishing active task...")
        self.running = False

    async def run(self):
        logger.info(f"Starting LeadGen Worker (Queue: leadgen:tasks, Concurrency target: {settings.WORKER_CONCURRENCY})")

        try:
            from app.db.session import AsyncSessionLocal
            from sqlalchemy import select, func
            from app.models.parameter import Parameter
            from app.engine.seed_parameters import seed_database
            async with AsyncSessionLocal() as chk_session:
                cnt_res = await chk_session.execute(select(func.count(Parameter.id)))
                param_count = cnt_res.scalar() or 0
                if param_count < 100:
                    logger.info(f"Worker startup: Database has only {param_count} parameters. Auto-seeding...")
                    await seed_database()
                    logger.info("Worker startup: Parameters seeded successfully.")
                else:
                    logger.info(f"Worker startup: Parameters verified ({param_count} parameters).")
        except Exception as seed_err:
            logger.warning(f"Worker startup parameter check notice: {seed_err}")

        r = aioredis.from_url(settings.REDIS_URL)

        while self.running:
            try:
                res = await r.brpop("leadgen:tasks", timeout=2)
                if not res:
                    continue

                _, raw_task = res
                task_data = json.loads(raw_task)
                task_type = task_data.get("type")
                job_id = task_data.get("job_id", "unknown")
                attempt = task_data.get("attempt", 1)
                max_attempts = task_data.get("max_attempts", 5)

                logger.info(f"Processing job [{job_id}] type: {task_type} (attempt {attempt}/{max_attempts})")

                try:
                    if task_type == "discover_businesses":
                        await handle_discover_businesses(task_data, self.openclaw_client)
                    elif task_type in ("research_and_qualify", "website_research"):
                        await handle_research_and_qualify(task_data, self.openclaw_client, self.ai_client)
                    elif task_type == "autopilot_campaign_run":
                        await handle_autopilot_campaign_run(task_data)
                    else:
                        logger.warning(f"Unrecognized task type: {task_type}")

                    logger.info(f"Job [{job_id}] completed successfully.")

                except Exception as task_err:
                    logger.error(f"Error executing job [{job_id}]: {task_err}")
                    if attempt < max_attempts:
                        base_delay = BACKOFF_STEPS[min(attempt - 1, len(BACKOFF_STEPS) - 1)]
                        jitter = random.uniform(0.9, 1.1)
                        delay = round(base_delay * jitter, 2)
                        task_data["attempt"] = attempt + 1
                        logger.info(f"Retrying job [{job_id}] in {delay}s...")
                        await asyncio.sleep(delay)
                        await r.lpush("leadgen:tasks", json.dumps(task_data))
                    else:
                        logger.error(f"Job [{job_id}] exceeded max attempts ({max_attempts}). Moving to 'leadgen:failed'.")
                        task_data["failed_reason"] = str(task_err)
                        await r.lpush("leadgen:failed", json.dumps(task_data))

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker queue polling error: {e}. Reconnecting in 3s...")
                await asyncio.sleep(3)

        await r.aclose()
        logger.info("Worker runner exited cleanly.")

async def main():
    runner = WorkerRunner()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, runner.stop)
        except NotImplementedError:
            pass

    await runner.run()

if __name__ == "__main__":
    asyncio.run(main())
