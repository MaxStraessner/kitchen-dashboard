from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext, active_member, valid_csrf
from app.core.time import utc_now
from app.database.models import Task
from app.database.session import get_session
from app.schemas.tasks import TaskCreate, TaskListResponse, TaskResponse, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


def task_response(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        title=task.title,
        completed=task.completed,
        created_at=task.created_at,
        updated_at=task.updated_at,
        completed_at=task.completed_at,
        sort_order=task.sort_order,
    )


async def household_task(database: AsyncSession, household_id: str, task_id: str) -> Task:
    task = await database.scalar(
        select(Task).where(Task.id == task_id, Task.household_id == household_id)
    )
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aufgabe nicht gefunden.")
    return task


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    auth: AuthContext = Depends(active_member), database: AsyncSession = Depends(get_session)
) -> TaskListResponse:
    tasks = (
        await database.scalars(
            select(Task)
            .where(Task.household_id == auth.household.id)
            .order_by(Task.completed.asc(), Task.sort_order.asc(), Task.id.asc())
        )
    ).all()
    return TaskListResponse(tasks=[task_response(task) for task in tasks])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> TaskResponse:
    next_order = (
        await database.scalar(
            select(func.coalesce(func.max(Task.sort_order), -1) + 1).where(
                Task.household_id == auth.household.id
            )
        )
    ) or 0
    now = utc_now()
    task = Task(
        id=str(uuid4()),
        household_id=auth.household.id,
        title=payload.title,
        completed=False,
        created_by_user_id=auth.user.id,
        completed_by_user_id=None,
        created_at=now,
        updated_at=now,
        completed_at=None,
        sort_order=next_order,
    )
    database.add(task)
    await database.commit()
    return task_response(task)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    payload: TaskUpdate,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> TaskResponse:
    task = await household_task(database, auth.household.id, task_id)
    now = utc_now()
    task.completed = payload.completed
    task.updated_at = now
    task.completed_at = now if payload.completed else None
    task.completed_by_user_id = auth.user.id if payload.completed else None
    await database.commit()
    return task_response(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> Response:
    task = await household_task(database, auth.household.id, task_id)
    await database.delete(task)
    await database.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
