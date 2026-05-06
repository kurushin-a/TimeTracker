"""
Analytics service — aggregates data across days.
"""

from __future__ import annotations
from collections import defaultdict
from datetime import date

from models import DaySummary, PeriodStats
from services import habit_service
import storage


def get_summaries(start: date, end: date) -> list[DaySummary]:
    days = storage.load_days_range(start, end)
    result = []
    for d in days:
        useful   = sum(a.duration_m for a in d.activities if a.impact == "useful")
        wasteful = sum(a.duration_m for a in d.activities if a.impact == "wasteful")
        denom    = useful + wasteful
        prod     = round(useful / denom, 3) if denom else 0.0
        result.append(DaySummary(
            date=d.date,
            rating=d.rating,
            productivity=prod,
            total_minutes=sum(a.duration_m for a in d.activities),
        ))
    return result


def get_period_stats(start: date, end: date) -> PeriodStats:
    days = storage.load_days_range(start, end)
    if not days:
        return PeriodStats(
            days_count=0, avg_rating=0, avg_productivity=0,
            time_by_category={}, time_by_impact={}, habit_stats=[],
        )

    by_category: dict[str, int] = defaultdict(int)
    by_impact:   dict[str, int] = defaultdict(int)
    ratings, productivities = [], []

    for d in days:
        useful   = sum(a.duration_m for a in d.activities if a.impact == "useful")
        wasteful = sum(a.duration_m for a in d.activities if a.impact == "wasteful")
        denom    = useful + wasteful
        productivities.append(useful / denom if denom else 0.0)
        ratings.append(d.rating)
        for a in d.activities:
            by_category[a.category] += a.duration_m
            by_impact[a.impact]     += a.duration_m

    n = len(days)
    return PeriodStats(
        days_count=n,
        avg_rating=round(sum(ratings) / n, 2),
        avg_productivity=round(sum(productivities) / n, 3),
        time_by_category=dict(by_category),
        time_by_impact=dict(by_impact),
        habit_stats=habit_service.get_habit_stats(start, end),
    )
