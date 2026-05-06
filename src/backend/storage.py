"""
JSON-based storage layer.
Swap this module for a DB adapter later without touching service layer.

Layout:
  data/days/YYYY-MM-DD.json
  data/habits.json
  data/tasks.json
"""

from __future__ import annotations
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from models import Day, Habit, Task

BASE_DIR    = Path(__file__).parent.parent.parent / "data"
DAYS_DIR    = BASE_DIR / "days"
HABITS_FILE = BASE_DIR / "habits.json"
TASKS_FILE  = BASE_DIR / "tasks.json"

DAYS_DIR.mkdir(parents=True, exist_ok=True)
BASE_DIR.mkdir(parents=True, exist_ok=True)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _day_path(d: date) -> Path:
    return DAYS_DIR / f"{d.isoformat()}.json"


def _read_json(path: Path) -> dict | list | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict | list) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )


# ─── Day storage ──────────────────────────────────────────────────────────────

def save_day(day: Day) -> None:
    _write_json(_day_path(day.date), day.model_dump(mode="json"))


def load_day(d: date) -> Optional[Day]:
    raw = _read_json(_day_path(d))
    return Day.model_validate(raw) if raw else None


def day_exists(d: date) -> bool:
    return _day_path(d).exists()


def load_days_range(start: date, end: date) -> list[Day]:
    days, cur = [], start
    while cur <= end:
        day = load_day(cur)
        if day:
            days.append(day)
        cur += timedelta(days=1)
    return days


def list_all_dates() -> list[date]:
    dates = []
    for path in sorted(DAYS_DIR.glob("*.json")):
        try:
            dates.append(date.fromisoformat(path.stem))
        except ValueError:
            pass
    return dates


# ─── Habit storage ────────────────────────────────────────────────────────────

def load_habits() -> list[Habit]:
    raw = _read_json(HABITS_FILE)
    return [Habit.model_validate(h) for h in raw] if raw else []


def save_habits(habits: list[Habit]) -> None:
    _write_json(HABITS_FILE, [h.model_dump(mode="json") for h in habits])


# ─── Task storage ─────────────────────────────────────────────────────────────

def load_tasks() -> list[Task]:
    raw = _read_json(TASKS_FILE)
    return [Task.model_validate(t) for t in raw] if raw else []


def save_tasks(tasks: list[Task]) -> None:
    _write_json(TASKS_FILE, [t.model_dump(mode="json") for t in tasks])
