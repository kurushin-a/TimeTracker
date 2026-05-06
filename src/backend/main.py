"""
TimeTracker API — FastAPI entry point.

Run:  uvicorn main:app --reload
Docs: http://localhost:8000/docs
"""

from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from models import (
    Day, DayCreate, DaySummary, PeriodStats,
    Habit, HabitCreate, HabitStat,
    Task, TaskCreate, TaskPeriod,
)
from services import day_service, analytics, habit_service, task_service

app = FastAPI(title="TimeTracker", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return RedirectResponse(url="/app")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# ─── Days ─────────────────────────────────────────────────────────────────────

@app.post("/api/days", response_model=Day, status_code=201)
def save_day(payload: DayCreate):
    return day_service.create_or_update_day(payload)

@app.get("/api/days/today", response_model=Day)
def get_today():
    day = day_service.get_today()
    if not day:
        raise HTTPException(404, "No entry for today yet")
    return day

@app.get("/api/days/{day_date}", response_model=Day)
def get_day(day_date: date):
    day = day_service.get_day(day_date)
    if not day:
        raise HTTPException(404, f"No entry for {day_date}")
    return day

@app.get("/api/days", response_model=list[date])
def list_days():
    return day_service.list_dates()


# ─── Analytics ────────────────────────────────────────────────────────────────

@app.get("/api/analytics/summaries", response_model=list[DaySummary])
def summaries(start: Optional[date] = None, end: Optional[date] = None):
    if end is None:   end   = date.today()
    if start is None: start = end - timedelta(days=29)
    return analytics.get_summaries(start, end)

@app.get("/api/analytics/stats", response_model=PeriodStats)
def period_stats(start: Optional[date] = None, end: Optional[date] = None):
    if end is None:   end   = date.today()
    if start is None: start = end - timedelta(days=29)
    return analytics.get_period_stats(start, end)


# ─── Habits ───────────────────────────────────────────────────────────────────

@app.get("/api/habits", response_model=list[Habit])
def list_habits():
    return habit_service.list_habits()

@app.post("/api/habits", response_model=Habit, status_code=201)
def create_habit(payload: HabitCreate):
    return habit_service.create_habit(payload)

@app.put("/api/habits/{habit_id}", response_model=Habit)
def update_habit(habit_id: str, payload: HabitCreate):
    habit = habit_service.update_habit(habit_id, payload)
    if not habit:
        raise HTTPException(404, "Habit not found")
    return habit

@app.delete("/api/habits/{habit_id}", status_code=204)
def delete_habit(habit_id: str):
    if not habit_service.delete_habit(habit_id):
        raise HTTPException(404, "Habit not found")

@app.get("/api/habits/stats", response_model=list[HabitStat])
def habit_stats(start: Optional[date] = None, end: Optional[date] = None):
    if end is None:   end   = date.today()
    if start is None: start = end - timedelta(days=29)
    return habit_service.get_habit_stats(start, end)


# ─── Tasks ────────────────────────────────────────────────────────────────────

@app.get("/api/tasks", response_model=dict)
def get_tasks_for_date(target_date: date = Query(default=None)):
    d = target_date or date.today()
    return task_service.get_tasks_for_date(d)

@app.post("/api/tasks", response_model=Task, status_code=201)
def create_task(payload: TaskCreate):
    return task_service.create_task(payload)

@app.put("/api/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, payload: TaskCreate):
    task = task_service.update_task(task_id, payload)
    if not task:
        raise HTTPException(404, "Task not found")
    return task

@app.patch("/api/tasks/{task_id}/toggle", response_model=Task)
def toggle_task(task_id: str, done: bool, done_date: Optional[date] = None):
    task = task_service.toggle_task(task_id, done, done_date or date.today())
    if not task:
        raise HTTPException(404, "Task not found")
    return task

@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: str):
    if not task_service.delete_task(task_id):
        raise HTTPException(404, "Task not found")
