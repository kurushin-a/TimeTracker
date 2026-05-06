# TimeTracker

Система ежедневной обратной связи: куда уходит время, что двигает вперёд.

## Структура

```
TimeTracker/
├── backend/
│   ├── main.py              # FastAPI, все роуты
│   ├── models.py            # Pydantic-модели (единственный источник правды)
│   ├── storage.py           # I/O JSON-файлов (легко заменить на БД)
│   └── services/
│       ├── day_service.py   # Бизнес-логика дней
│       ├── habit_service.py # CRUD привычек
│       └── analytics.py    # Агрегации за период
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── requirements.txt
```

## Запуск

```bash
# 1. Зависимости
pip install -r requirements.txt

# 2. Запустить API
cd backend
uvicorn main:app --reload

# 3. Открыть в браузере
# Приложение:  http://localhost:8000/app
# Swagger:     http://localhost:8000/docs
```

## API

| Метод  | Путь                        | Описание                          |
|--------|-----------------------------|-----------------------------------|
| POST   | /api/days                   | Создать / обновить день           |
| GET    | /api/days/{date}            | Получить день (YYYY-MM-DD)        |
| GET    | /api/days/today             | Сегодняшний день                  |
| GET    | /api/days                   | Список всех дат                   |
| GET    | /api/analytics/summaries    | Сводка по дням за период          |
| GET    | /api/analytics/stats        | Агрегированная статистика         |
| GET    | /api/habits                 | Список привычек                   |
| POST   | /api/habits                 | Добавить привычку                 |
| DELETE | /api/habits/{id}            | Удалить привычку                  |

## Модели

**Impact (импакт действия)**
- `useful` — полезное, двигает цели
- `necessary` — необходимое, но не двигает
- `pleasant` — приятное, нейтральное
- `wasteful` — впустую

**Category**
work / learning / health / relations / rest / chores / other

## Что дальше

- [ ] Паттерны: цикл «начал → бросил»
- [ ] График продуктивности по дням (canvas/chart.js)
- [ ] Экспорт в CSV / Markdown
- [ ] Уведомления-напоминания (напр. через cron + email)
- [ ] Миграция хранилища на SQLite
