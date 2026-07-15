from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from test_authentication import csrf, setup

from app.core.time import utc_now
from app.database.models import Household, Task


async def test_tasks_require_login_and_are_household_scoped(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/tasks")).status_code == 401
    await setup(client)
    assert (await client.get("/api/v1/tasks")).json() == {"tasks": []}


async def test_create_complete_reopen_and_delete_task(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    token = await csrf(client)
    invalid = await client.post(
        "/api/v1/tasks", headers={"X-CSRF-Token": token}, json={"title": "  "}
    )
    assert invalid.status_code == 422

    created = await client.post(
        "/api/v1/tasks", headers={"X-CSRF-Token": token}, json={"title": " Küche putzen "}
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["title"] == "Küche putzen"
    assert task["completed"] is False
    assert task["completedAt"] is None
    assert (await client.get("/api/v1/tasks")).json()["tasks"][0]["id"] == task["id"]

    completed = await client.patch(
        f"/api/v1/tasks/{task['id']}", headers={"X-CSRF-Token": token}, json={"completed": True}
    )
    assert completed.status_code == 200
    assert completed.json()["completed"] is True
    assert completed.json()["completedAt"] is not None
    database_task = await session.get(Task, task["id"])
    assert database_task is not None and database_task.completed_by_user_id is not None

    reopened = await client.patch(
        f"/api/v1/tasks/{task['id']}", headers={"X-CSRF-Token": token}, json={"completed": False}
    )
    assert reopened.status_code == 200
    assert reopened.json()["completedAt"] is None
    await session.refresh(database_task)
    assert database_task.completed_by_user_id is None

    assert (
        await client.delete(f"/api/v1/tasks/{task['id']}", headers={"X-CSRF-Token": token})
    ).status_code == 204
    assert await session.get(Task, task["id"]) is None
    assert (
        await client.patch(
            f"/api/v1/tasks/{task['id']}", headers={"X-CSRF-Token": token}, json={"completed": True}
        )
    ).status_code == 404


async def test_tasks_are_not_exposed_across_households(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    token = await csrf(client)
    task = (
        await client.post(
            "/api/v1/tasks", headers={"X-CSRF-Token": token}, json={"title": "Privat"}
        )
    ).json()
    database_task = await session.get(Task, task["id"])
    assert database_task is not None
    now = utc_now()
    session.add(
        Household(
            id="unrelated-household",
            name="Andere",
            setup_guard=None,
            created_at=now,
            updated_at=now,
        )
    )
    database_task.household_id = "unrelated-household"
    await session.commit()
    assert (
        await client.delete(f"/api/v1/tasks/{task['id']}", headers={"X-CSRF-Token": token})
    ).status_code == 404
