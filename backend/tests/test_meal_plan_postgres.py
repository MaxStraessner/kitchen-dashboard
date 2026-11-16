"""Optional real PostgreSQL regression; each run owns and removes a unique test schema.

Set KITCHEN_TEST_POSTGRES_URL to an explicitly isolated test database to run this test.
"""

import asyncio
import os
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from test_meal_plan import image_bytes

from app.core.config import Settings, get_settings
from app.database.base import Base
from app.database.models import MealPlan
from app.database.session import get_session
from app.main import app


@pytest.mark.skipif(
    not os.environ.get("KITCHEN_TEST_POSTGRES_URL"), reason="isolated PostgreSQL URL not provided"
)
async def test_parallel_first_upload_replacements_and_delete(tmp_path: Path) -> None:
    url = os.environ["KITCHEN_TEST_POSTGRES_URL"]
    schema = "meal_plan_test_" + uuid4().hex
    admin_engine = create_async_engine(url)
    async with admin_engine.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    factory = async_sessionmaker(engine, expire_on_commit=False)
    previous = app.dependency_overrides.copy()
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        settings = Settings(app_env="test", database_url=url, media_root=tmp_path)

        async def sessions():
            async with factory() as database:
                yield database

        app.dependency_overrides[get_session] = sessions
        app.dependency_overrides[get_settings] = lambda: settings
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/setup/initialize",
                json={
                    "householdName": "Synthetic household",
                    "displayName": "Test",
                    "username": "test",
                    "password": "synthetic test passphrase",
                    "passwordConfirmation": "synthetic test passphrase",
                },
            )
            assert response.status_code == 200, response.text
            token = (await client.get("/api/v1/auth/csrf")).json()["csrfToken"]

            async def upload(index: int):
                return await client.put(
                    "/api/v1/meal-plan",
                    headers={"X-CSRF-Token": token},
                    files={"file": (f"plan-{index}.png", image_bytes(), "image/png")},
                )

            results = await asyncio.gather(*(upload(index) for index in range(8)))
            assert [response.status_code for response in results] == [200] * 8
            current = (await client.get("/api/v1/meal-plan")).json()["plan"]
            assert current["id"] in [response.json()["plan"]["id"] for response in results]
            async with factory() as database:
                assert await database.scalar(select(func.count(MealPlan.id))) == 1
            assert (await client.get(current["imageUrl"])).status_code == 200
            assert len(list((tmp_path / "meal-plans").glob("*.webp"))) == 2
            mixed = await asyncio.gather(
                upload(9), client.delete("/api/v1/meal-plan", headers={"X-CSRF-Token": token})
            )
            assert [response.status_code for response in mixed] == [200, 204]
            await engine.dispose()  # simulate fresh DB connections after a backend restart
            current = (await client.get("/api/v1/meal-plan")).json()["plan"]
            if current:
                assert (await client.get(current["imageUrl"])).status_code == 200
            await client.delete("/api/v1/meal-plan", headers={"X-CSRF-Token": token})
            assert not list((tmp_path / "meal-plans").glob("*.webp"))
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        await engine.dispose()
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin_engine.dispose()
