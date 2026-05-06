"""
Habit service — CRUD + статистика привычек.
"""

from __future__ import annotations
import uuid
from datetime import date, timedelta

from models import Habit, HabitCreate, HabitFrequency, HabitStat
import storage


def list_habits() -> list[Habit]:
    return storage.load_habits()


def create_habit(payload: HabitCreate) -> Habit:
    habits = storage.load_habits()
    habit  = Habit(
        id=str(uuid.uuid4()),
        created_at=date.today().isoformat(),
        **payload.model_dump()
    )
    habits.append(habit)
    storage.save_habits(habits)
    return habit


def update_habit(habit_id: str, payload: HabitCreate) -> Habit | None:
    habits = storage.load_habits()
    for i, h in enumerate(habits):
        if h.id == habit_id:
            habits[i] = Habit(id=h.id, created_at=h.created_at, **payload.model_dump())
            storage.save_habits(habits)
            return habits[i]
    return None


def delete_habit(habit_id: str) -> bool:
    habits  = storage.load_habits()
    updated = [h for h in habits if h.id != habit_id]
    if len(updated) == len(habits):
        return False
    storage.save_habits(updated)
    return True


def get_habit_stats(start: date, end: date) -> list[HabitStat]:
    habits = storage.load_habits()
    days   = storage.load_days_range(start, end)

    # собираем множество дат выполнения для каждой привычки
    done_map: dict[str, set[str]] = {h.id: set() for h in habits}
    for day in days:
        for hid in day.habits_done:
            if hid in done_map:
                done_map[hid].add(day.date.isoformat())

    result = []
    for habit in habits:
        done_dates = sorted(done_map[habit.id])

        # текущая серия (streak) — считаем назад от сегодня
        streak, cur = 0, date.today()
        while cur >= start:
            iso = cur.isoformat()
            # для daily: должен быть каждый день
            # для weekly: считаем за неделю
            if habit.frequency == HabitFrequency.daily:
                if iso in done_map[habit.id]:
                    streak += 1
                else:
                    break
            else:
                # для weekly проверяем неделю целиком
                week_start = cur - timedelta(days=cur.weekday())
                week_end   = week_start + timedelta(days=6)
                week_done  = sum(
                    1 for d in done_map[habit.id]
                    if week_start.isoformat() <= d <= week_end.isoformat()
                )
                if week_done >= habit.times_per_week:
                    streak += 1
                    cur = week_start - timedelta(days=1)
                    continue
                else:
                    break
            cur -= timedelta(days=1)

        # completion rate
        total_days = (end - start).days + 1
        if habit.frequency == HabitFrequency.daily:
            target = total_days
            actual = len(done_dates)
        else:
            # сколько недель в периоде × times_per_week
            weeks  = max(1, total_days // 7)
            target = weeks * habit.times_per_week
            actual = len(done_dates)

        rate = round(min(actual / target, 1.0), 3) if target else 0.0

        result.append(HabitStat(
            habit=habit,
            done_dates=done_dates,
            streak=streak,
            completion_rate=rate,
        ))

    return result
