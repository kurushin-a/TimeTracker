"""
Core data models for TimeTracker.
All domain entities are defined here — single source of truth.
"""

from __future__ import annotations
from datetime import date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class Category(str, Enum):
    work       = "work"
    learning   = "learning"
    health     = "health"
    relations  = "relations"
    rest       = "rest"
    chores     = "chores"
    other      = "other"


class Impact(str, Enum):
    useful     = "useful"      # продвигает цели
    necessary  = "necessary"   # нужно, но не двигает
    pleasant   = "pleasant"    # приятно, нейтрально
    wasteful   = "wasteful"    # впустую


class HabitFrequency(str, Enum):
    daily   = "daily"    # каждый день
    weekly  = "weekly"   # N раз в неделю


# ─── Activity ─────────────────────────────────────────────────────────────────

class ActivityCreate(BaseModel):
    title:      str           = Field(..., min_length=1, max_length=200)
    category:   Category
    impact:     Impact
    duration_m: int           = Field(..., ge=1, le=1440)
    note:       Optional[str] = Field(None, max_length=500)


class Activity(ActivityCreate):
    id: str


# ─── Habit ────────────────────────────────────────────────────────────────────

class HabitCreate(BaseModel):
    title:              str           = Field(..., min_length=1, max_length=100)
    frequency:          HabitFrequency = HabitFrequency.daily
    times_per_week:     int           = Field(1, ge=1, le=7,
                            description="Цель раз в неделю (только для frequency=weekly)")
    category:           Category      = Category.health
    note:               Optional[str] = Field(None, max_length=300)


class Habit(HabitCreate):
    id:         str
    created_at: str  # ISO date string


# ─── Task (планирование) ──────────────────────────────────────────────────────

class TaskPeriod(str, Enum):
    day   = "day"
    week  = "week"
    month = "month"


class TaskCreate(BaseModel):
    title:      str           = Field(..., min_length=1, max_length=200)
    period:     TaskPeriod
    target_date: date         = Field(..., description="День/неделя/месяц к которому относится задача")
    category:   Category      = Category.work
    note:       Optional[str] = Field(None, max_length=500)


class Task(TaskCreate):
    id:        str
    done:      bool = False
    done_date: Optional[str] = None   # ISO date когда отмечена выполненной


# ─── Day ──────────────────────────────────────────────────────────────────────

class DayCreate(BaseModel):
    date:        date
    activities:  list[ActivityCreate] = Field(default_factory=list)
    habits_done: list[str]            = Field(default_factory=list, description="Habit IDs")
    tasks_done:  list[str]            = Field(default_factory=list, description="Task IDs выполненных сегодня")
    rating:      int                  = Field(..., ge=1, le=10)
    note:        Optional[str]        = Field(None, max_length=1000)


class Day(DayCreate):
    activities:      list[Activity] = Field(default_factory=list)
    total_minutes:   int   = 0
    useful_minutes:  int   = 0
    wasteful_minutes: int  = 0
    productivity:    float = 0.0


# ─── Analytics ────────────────────────────────────────────────────────────────

class DaySummary(BaseModel):
    date:          date
    rating:        int
    productivity:  float
    total_minutes: int


class HabitStat(BaseModel):
    habit:        Habit
    done_dates:   list[str]   # ISO dates за запрошенный период
    streak:       int          # текущая серия дней подряд
    completion_rate: float     # выполнение vs цель за период 0..1


class PeriodStats(BaseModel):
    days_count:       int
    avg_rating:       float
    avg_productivity: float
    time_by_category: dict[str, int]
    time_by_impact:   dict[str, int]
    habit_stats:      list[HabitStat]
