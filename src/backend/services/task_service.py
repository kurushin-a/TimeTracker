"""
Task service — CRUD для задач (планирование).
"""

from __future__ import annotations
import uuid
from datetime import date, timedelta

from models import Task, TaskCreate, TaskPeriod
import storage


def list_tasks(target_date: date | None = None, period: TaskPeriod | None = None) -> list[Task]:
    tasks = storage.load_tasks()
    if target_date:
        tasks = [t for t in tasks if _matches(t, target_date, period)]
    return tasks


def _matches(task: Task, d: date, period: TaskPeriod | None) -> bool:
    """Проверяем, входит ли задача в нужный период относительно даты d."""
    if period == TaskPeriod.day or task.period == TaskPeriod.day:
        return task.target_date == d
    if period == TaskPeriod.week or task.period == TaskPeriod.week:
        week_start = d - timedelta(days=d.weekday())
        week_end   = week_start + timedelta(days=6)
        return week_start <= task.target_date <= week_end
    if period == TaskPeriod.month or task.period == TaskPeriod.month:
        return task.target_date.year == d.year and task.target_date.month == d.month
    return False


def get_tasks_for_date(d: date) -> dict[str, list[Task]]:
    """Вернуть задачи сгруппированные по периодам для конкретной даты."""
    all_tasks = storage.load_tasks()
    result: dict[str, list[Task]] = {"day": [], "week": [], "month": []}

    week_start = d - timedelta(days=d.weekday())
    week_end   = week_start + timedelta(days=6)

    for t in all_tasks:
        if t.period == TaskPeriod.day and t.target_date == d:
            result["day"].append(t)
        elif t.period == TaskPeriod.week and week_start <= t.target_date <= week_end:
            result["week"].append(t)
        elif t.period == TaskPeriod.month and t.target_date.year == d.year and t.target_date.month == d.month:
            result["month"].append(t)

    return result


def create_task(payload: TaskCreate) -> Task:
    tasks = storage.load_tasks()
    task  = Task(id=str(uuid.uuid4()), **payload.model_dump())
    tasks.append(task)
    storage.save_tasks(tasks)
    return task


def update_task(task_id: str, payload: TaskCreate) -> Task | None:
    tasks = storage.load_tasks()
    for i, t in enumerate(tasks):
        if t.id == task_id:
            tasks[i] = Task(id=t.id, done=t.done, done_date=t.done_date, **payload.model_dump())
            storage.save_tasks(tasks)
            return tasks[i]
    return None


def toggle_task(task_id: str, done: bool, done_date: date | None = None) -> Task | None:
    tasks = storage.load_tasks()
    for i, t in enumerate(tasks):
        if t.id == task_id:
            tasks[i].done      = done
            tasks[i].done_date = done_date.isoformat() if done_date and done else None
            storage.save_tasks(tasks)
            return tasks[i]
    return None


def delete_task(task_id: str) -> bool:
    tasks   = storage.load_tasks()
    updated = [t for t in tasks if t.id != task_id]
    if len(updated) == len(tasks):
        return False
    storage.save_tasks(updated)
    return True
