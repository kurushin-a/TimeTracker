"""
Day service — business logic for creating and reading days.
"""

from __future__ import annotations
import uuid
from datetime import date

from models import Activity, ActivityCreate, Day, DayCreate
import storage


def _compute_stats(day: Day) -> Day:
    """Fill in computed fields (mutates and returns day)."""
    total    = sum(a.duration_m for a in day.activities)
    useful   = sum(a.duration_m for a in day.activities if a.impact == "useful")
    wasteful = sum(a.duration_m for a in day.activities if a.impact == "wasteful")
    denominator = useful + wasteful

    day.total_minutes    = total
    day.useful_minutes   = useful
    day.wasteful_minutes = wasteful
    day.productivity     = round(useful / denominator, 3) if denominator else 0.0
    return day


def _make_activities(raw: list[ActivityCreate]) -> list[Activity]:
    return [Activity(id=str(uuid.uuid4()), **a.model_dump()) for a in raw]


def create_or_update_day(payload: DayCreate) -> Day:
    activities = _make_activities(payload.activities)
    day = Day(
        date=payload.date,
        activities=activities,
        habits_done=payload.habits_done,
        rating=payload.rating,
        note=payload.note,
    )
    _compute_stats(day)
    storage.save_day(day)
    return day


def get_day(d: date) -> Day | None:
    day = storage.load_day(d)
    if day:
        _compute_stats(day)
    return day


def get_today() -> Day | None:
    return get_day(date.today())


def list_dates() -> list[date]:
    return storage.list_all_dates()
