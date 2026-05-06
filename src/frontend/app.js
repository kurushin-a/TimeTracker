const API = "http://localhost:8000/api";

// ─── Date utils ───────────────────────────────────────────────────────────────

const todayIso = (() => {
  const d = new Date();
  return isoOf(d);
})();

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function localDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftIso(iso, delta) {
  const d = localDate(iso);
  d.setDate(d.getDate() + delta);
  return isoOf(d);
}

function friendlyDate(iso) {
  if (iso === todayIso) return "сегодня";
  if (iso === shiftIso(todayIso, -1)) return "вчера";
  return localDate(iso).toLocaleDateString("ru-RU", { day:"numeric", month:"long" });
}

// ─── Dictionaries ─────────────────────────────────────────────────────────────

const RU_MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                   "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const RU_DAYS   = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const CAT_LABELS    = { work:"Работа", learning:"Обучение", health:"Здоровье",
                        relations:"Отношения", rest:"Отдых", chores:"Быт", other:"Другое" };
const IMPACT_LABELS = { useful:"Полезное", necessary:"Необходимое",
                        pleasant:"Приятное", wasteful:"Впустую" };
const IMPACT_COLORS = { useful:"#43a047", necessary:"#1e88e5",
                        pleasant:"#fb8c00", wasteful:"#e53935" };
const PERIOD_LABELS = { day:"День", week:"Неделя", month:"Месяц" };
const FREQ_LABELS   = { daily:"каждый день", weekly:"раз в неделю" };

function fmtH(min) { return `${(min/60).toFixed(1)} ч`; }

function ratingColor(r) {
  if (!r) return "#f0f0f0";
  if (r <= 3) return "#ffcdd2";
  if (r <= 6) return "#fff9c4";
  if (r <= 8) return "#c8e6c9";
  return "#43a047";
}
function ratingTextColor(r) { return r >= 9 ? "#fff" : "#333"; }

// ─── Navigation ───────────────────────────────────────────────────────────────

function switchPage(name) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === `page-${name}`));
  if (name === "stats")   initStats();
  if (name === "habits")  initHabitsPage();
  if (name === "tasks")   initTasksPage();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchPage(btn.dataset.page));
});

// ─── LOG PAGE ─────────────────────────────────────────────────────────────────

const dateInput = document.getElementById("selected-date");
const dateLabel = document.getElementById("date-label");
dateInput.value = todayIso;
dateLabel.textContent = "сегодня";

dateInput.addEventListener("change", () => {
  dateLabel.textContent = friendlyDate(dateInput.value);
  loadLogPage(dateInput.value);
});
document.getElementById("date-prev").addEventListener("click", () => {
  dateInput.value = shiftIso(dateInput.value, -1);
  dateLabel.textContent = friendlyDate(dateInput.value);
  loadLogPage(dateInput.value);
});
document.getElementById("date-next").addEventListener("click", () => {
  const next = shiftIso(dateInput.value, 1);
  if (next > todayIso) return;
  dateInput.value = next;
  dateLabel.textContent = friendlyDate(dateInput.value);
  loadLogPage(dateInput.value);
});

async function loadLogPage(iso) {
  await Promise.all([
    loadDayIntoForm(iso),
    loadDayTasks(iso),
  ]);
}

// Activities
const actList = document.getElementById("activities-list");
const actTpl  = document.getElementById("activity-tpl");

document.getElementById("add-activity-btn").addEventListener("click", () => addActivityRow());

function addActivityRow(data = {}) {
  const row = actTpl.content.cloneNode(true).querySelector(".activity-row");
  if (data.title)      row.querySelector(".act-title").value    = data.title;
  if (data.category)   row.querySelector(".act-category").value = data.category;
  if (data.impact)     row.querySelector(".act-impact").value   = data.impact;
  if (data.duration_m) row.querySelector(".act-duration").value = data.duration_m;
  if (data.note)       row.querySelector(".act-note").value     = data.note;
  row.querySelector(".act-remove").addEventListener("click", () => row.remove());
  actList.appendChild(row);
}

function collectActivities() {
  return [...actList.querySelectorAll(".activity-row")].map(row => ({
    title:      row.querySelector(".act-title").value.trim(),
    category:   row.querySelector(".act-category").value,
    impact:     row.querySelector(".act-impact").value,
    duration_m: parseInt(row.querySelector(".act-duration").value) || 0,
    note:       row.querySelector(".act-note").value.trim() || null,
  })).filter(a => a.title && a.duration_m > 0);
}

// Habits in log
let habits = [];

async function loadHabits() {
  habits = await fetch(`${API}/habits`).then(r => r.json()).catch(() => []);
}

function renderLogHabits(doneIds = []) {
  const list = document.getElementById("habits-list");
  list.innerHTML = "";
  if (!habits.length) {
    list.innerHTML = `<em class="muted">Нет привычек. <button class="btn-link" onclick="switchPage('habits')">Добавить</button></em>`;
    return;
  }
  habits.forEach(h => {
    const row = document.createElement("div");
    row.className = "habit-row";
    const freqLabel = h.frequency === "daily" ? "каждый день" : `${h.times_per_week}x в неделю`;
    row.innerHTML = `
      <input type="checkbox" id="h-${h.id}" value="${h.id}" ${doneIds.includes(h.id) ? "checked" : ""} />
      <label for="h-${h.id}">
        <span class="habit-title">${h.title}</span>
        <span class="habit-freq">${freqLabel}</span>
      </label>`;
    list.appendChild(row);
  });
}

// Load day into form
const ratingInput = document.getElementById("rating");
const ratingVal   = document.getElementById("rating-val");
ratingInput.addEventListener("input", () => ratingVal.textContent = ratingInput.value);

async function loadDayIntoForm(iso) {
  actList.innerHTML = "";
  ratingInput.value = 7;
  ratingVal.textContent = 7;
  document.getElementById("note").value = "";
  renderLogHabits([]);
  document.getElementById("save-status").textContent = "";

  const res = await fetch(`${API}/days/${iso}`).catch(() => null);
  if (!res || !res.ok) return;
  const day = await res.json();
  ratingInput.value = day.rating;
  ratingVal.textContent = day.rating;
  if (day.note) document.getElementById("note").value = day.note;
  day.activities.forEach(addActivityRow);
  renderLogHabits(day.habits_done);
}

// Tasks in log (просмотр + отметка)
async function loadDayTasks(iso) {
  const el = document.getElementById("day-tasks-list");
  el.innerHTML = "<em class='muted'>Загрузка...</em>";
  const data = await fetch(`${API}/tasks?target_date=${iso}`).then(r => r.json()).catch(() => ({}));
  const allTasks = [...(data.day||[]), ...(data.week||[]), ...(data.month||[])];
  if (!allTasks.length) {
    el.innerHTML = "<em class='muted'>Нет задач на этот день</em>";
    return;
  }
  el.innerHTML = "";
  ["day","week","month"].forEach(period => {
    const list = data[period] || [];
    if (!list.length) return;
    const grp = document.createElement("div");
    grp.className = "task-group";
    grp.innerHTML = `<div class="task-group-label">${PERIOD_LABELS[period]}</div>`;
    list.forEach(t => {
      const row = document.createElement("div");
      row.className = "task-row" + (t.done ? " task-done" : "");
      row.innerHTML = `
        <input type="checkbox" class="task-cb" data-id="${t.id}" ${t.done ? "checked" : ""} />
        <span class="task-title">${t.title}</span>
        <span class="detail-tag cat-${t.category}">${CAT_LABELS[t.category]||t.category}</span>`;
      row.querySelector(".task-cb").addEventListener("change", async (e) => {
        await fetch(`${API}/tasks/${t.id}/toggle?done=${e.target.checked}&done_date=${iso}`, { method:"PATCH" });
        row.classList.toggle("task-done", e.target.checked);
      });
      grp.appendChild(row);
    });
    el.appendChild(grp);
  });
}

// Save day
document.getElementById("save-day-btn").addEventListener("click", async () => {
  const status = document.getElementById("save-status");
  const habits_done = [...document.querySelectorAll("#habits-list input:checked")].map(cb => cb.value);
  const payload = {
    date:       dateInput.value,
    activities: collectActivities(),
    habits_done,
    tasks_done: [],  // задачи отмечаются отдельно через /toggle
    rating: parseInt(ratingInput.value),
    note:   document.getElementById("note").value.trim() || null,
  };
  status.textContent = "Сохраняю...";
  try {
    const res = await fetch(`${API}/days`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    status.textContent = "✓ День сохранён";
    if (calYear !== undefined) { await refreshSummaryCache(); renderCalendar(); }
  } catch (e) {
    status.textContent = "Ошибка: " + e.message;
  }
});

// ─── TASKS PAGE ───────────────────────────────────────────────────────────────

let taskViewDate = todayIso;

async function initTasksPage() {
  document.getElementById("task-view-date").value = taskViewDate;
  document.getElementById("task-date-label").textContent = friendlyDate(taskViewDate);
  document.getElementById("task-date").value = taskViewDate;

  document.getElementById("task-date-prev").onclick = () => {
    taskViewDate = shiftIso(taskViewDate, -1);
    document.getElementById("task-view-date").value = taskViewDate;
    document.getElementById("task-date-label").textContent = friendlyDate(taskViewDate);
    renderTasks();
  };
  document.getElementById("task-date-next").onclick = () => {
    taskViewDate = shiftIso(taskViewDate, 1);
    document.getElementById("task-view-date").value = taskViewDate;
    document.getElementById("task-date-label").textContent = friendlyDate(taskViewDate);
    renderTasks();
  };
  document.getElementById("task-view-date").onchange = (e) => {
    taskViewDate = e.target.value;
    document.getElementById("task-date-label").textContent = friendlyDate(taskViewDate);
    renderTasks();
  };

  document.getElementById("open-add-task").onclick = () => {
    document.getElementById("add-task-form").style.display = "block";
    document.getElementById("task-date").value = taskViewDate;
  };
  document.getElementById("cancel-task-btn").onclick = () => {
    document.getElementById("add-task-form").style.display = "none";
  };
  document.getElementById("save-task-btn").onclick = saveTask;

  renderTasks();
}

async function renderTasks() {
  const el = document.getElementById("tasks-by-period");
  el.innerHTML = "<em class='muted'>Загрузка...</em>";
  const data = await fetch(`${API}/tasks?target_date=${taskViewDate}`).then(r => r.json()).catch(() => ({}));

  el.innerHTML = "";
  let hasAny = false;

  ["day","week","month"].forEach(period => {
    const list = data[period] || [];
    if (!list.length) return;
    hasAny = true;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>${PERIOD_LABELS[period]}</h3>`;
    list.forEach(t => {
      const row = document.createElement("div");
      row.className = "task-row" + (t.done ? " task-done" : "");
      row.innerHTML = `
        <input type="checkbox" class="task-cb" ${t.done ? "checked" : ""} />
        <span class="task-title">${t.title}</span>
        <span class="detail-tag cat-${t.category}">${CAT_LABELS[t.category]||t.category}</span>
        ${t.note ? `<span class="task-note">${t.note}</span>` : ""}
        <button class="task-del" data-id="${t.id}" title="Удалить">✕</button>`;
      row.querySelector(".task-cb").addEventListener("change", async (e) => {
        await fetch(`${API}/tasks/${t.id}/toggle?done=${e.target.checked}&done_date=${taskViewDate}`, { method:"PATCH" });
        row.classList.toggle("task-done", e.target.checked);
      });
      row.querySelector(".task-del").addEventListener("click", async () => {
        await fetch(`${API}/tasks/${t.id}`, { method:"DELETE" });
        renderTasks();
      });
      card.appendChild(row);
    });
    el.appendChild(card);
  });

  if (!hasAny) el.innerHTML = "<div class='card'><em class='muted'>Нет задач на выбранный период</em></div>";
}

async function saveTask() {
  const payload = {
    title:       document.getElementById("task-title").value.trim(),
    period:      document.getElementById("task-period").value,
    target_date: document.getElementById("task-date").value,
    category:    document.getElementById("task-category").value,
    note:        document.getElementById("task-note").value.trim() || null,
  };
  if (!payload.title || !payload.target_date) return;
  await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  document.getElementById("task-title").value = "";
  document.getElementById("task-note").value  = "";
  document.getElementById("add-task-form").style.display = "none";
  renderTasks();
}

// ─── HABITS PAGE ──────────────────────────────────────────────────────────────

async function initHabitsPage() {
  document.getElementById("open-add-habit").onclick = () => {
    document.getElementById("add-habit-form").style.display = "block";
  };
  document.getElementById("cancel-habit-btn").onclick = () => {
    document.getElementById("add-habit-form").style.display = "none";
  };
  document.getElementById("save-habit-btn").onclick = saveHabit;

  document.getElementById("habit-frequency").addEventListener("change", (e) => {
    document.getElementById("times-per-week-label").style.display =
      e.target.value === "weekly" ? "block" : "none";
  });

  renderHabitsPage();
}

async function renderHabitsPage() {
  const el = document.getElementById("habits-page-list");
  el.innerHTML = "<em class='muted'>Загрузка...</em>";

  // грузим привычки + статистику за 28 дней
  const end   = todayIso;
  const start = shiftIso(todayIso, -27);
  const [habitList, stats] = await Promise.all([
    fetch(`${API}/habits`).then(r => r.json()).catch(() => []),
    fetch(`${API}/analytics/stats?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({ habit_stats: [] })),
  ]);

  habits = habitList; // обновляем глобальный список

  if (!habitList.length) {
    el.innerHTML = "<div class='card'><em class='muted'>Нет привычек. Добавьте первую!</em></div>";
    return;
  }

  const statsMap = {};
  (stats.habit_stats || []).forEach(s => { statsMap[s.habit.id] = s; });

  // последние 28 дней для тепловой карты
  const dates28 = [];
  for (let i = 27; i >= 0; i--) dates28.push(shiftIso(todayIso, -i));

  el.innerHTML = "";
  habitList.forEach(h => {
    const s    = statsMap[h.id];
    const done = new Set(s?.done_dates || []);
    const streak = s?.streak || 0;
    const rate   = s ? Math.round(s.completion_rate * 100) : 0;
    const freqLabel = h.frequency === "daily" ? "Каждый день" : `${h.times_per_week}× в неделю`;

    const card = document.createElement("div");
    card.className = "card habit-card";

    // тепловая карта — 28 ячеек
    const cells = dates28.map(iso => {
      const isDone = done.has(iso);
      const d = localDate(iso);
      const label = d.toLocaleDateString("ru-RU", { day:"numeric", month:"short" });
      return `<div class="heat-cell ${isDone ? "heat-done" : "heat-empty"}" title="${label}"></div>`;
    }).join("");

    card.innerHTML = `
      <div class="habit-card-header">
        <div>
          <span class="habit-card-title">${h.title}</span>
          <span class="detail-tag cat-${h.category}">${CAT_LABELS[h.category]||h.category}</span>
        </div>
        <button class="act-remove habit-del" data-id="${h.id}" title="Удалить">✕</button>
      </div>
      <div class="habit-meta">
        <span>${freqLabel}</span>
        <span>🔥 Серия: <b>${streak}</b> ${h.frequency === "daily" ? "дн." : "нед."}</span>
        <span>✅ Выполнение: <b>${rate}%</b> за 28 дн.</span>
      </div>
      <div class="heat-map">${cells}</div>
      <div class="heat-labels">
        <span>${localDate(dates28[0]).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>
        <span>${localDate(dates28[dates28.length-1]).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>
      </div>`;

    card.querySelector(".habit-del").addEventListener("click", async () => {
      if (!confirm(`Удалить привычку «${h.title}»?`)) return;
      await fetch(`${API}/habits/${h.id}`, { method:"DELETE" });
      renderHabitsPage();
    });

    el.appendChild(card);
  });
}

async function saveHabit() {
  const freq = document.getElementById("habit-frequency").value;
  const payload = {
    title:          document.getElementById("habit-title").value.trim(),
    category:       document.getElementById("habit-category").value,
    frequency:      freq,
    times_per_week: freq === "weekly" ? parseInt(document.getElementById("habit-times").value) : 1,
    note:           document.getElementById("habit-note").value.trim() || null,
  };
  if (!payload.title) return;
  await fetch(`${API}/habits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  document.getElementById("habit-title").value = "";
  document.getElementById("habit-note").value  = "";
  document.getElementById("add-habit-form").style.display = "none";
  renderHabitsPage();
}

// ─── STATS PAGE ───────────────────────────────────────────────────────────────

let calYear, calMonth;
let summaryCache = {};
let statsInited  = false;

async function refreshSummaryCache() {
  const allDates = await fetch(`${API}/days`).then(r => r.json()).catch(() => []);
  if (!allDates.length) return;
  const start = allDates[0];
  const sums  = await fetch(`${API}/analytics/summaries?start=${start}&end=${todayIso}`)
                       .then(r => r.json()).catch(() => []);
  summaryCache = {};
  sums.forEach(s => { summaryCache[s.date] = s; });
}

async function initStats() {
  if (!statsInited) {
    const now = new Date();
    calYear  = now.getFullYear();
    calMonth = now.getMonth();

    document.getElementById("cal-prev").addEventListener("click", () => shiftMonth(-1));
    document.getElementById("cal-next").addEventListener("click", () => shiftMonth(+1));
    document.querySelectorAll(".period-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        loadPeriodStats(parseInt(btn.dataset.days));
      });
    });
    statsInited = true;
  }
  await refreshSummaryCache();
  renderCalendar();
  loadPeriodStats(30);
}

function shiftMonth(delta) {
  calMonth += delta;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  renderCalendar();
}

function renderCalendar() {
  if (calYear === undefined) return;
  document.getElementById("cal-title").textContent = `${RU_MONTHS[calMonth]} ${calYear}`;
  const cal = document.getElementById("calendar");
  cal.innerHTML = "";

  const header = document.createElement("div");
  header.className = "cal-grid";
  RU_DAYS.forEach(d => {
    const cell = document.createElement("div");
    cell.className = "cal-dow";
    cell.textContent = d;
    header.appendChild(cell);
  });
  cal.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "cal-grid";
  const firstDay  = new Date(calYear, calMonth, 1);
  const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
  const dow = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < dow; i++) {
    const e = document.createElement("div");
    e.className = "cal-cell cal-empty";
    grid.appendChild(e);
  }
  for (let day = 1; day <= totalDays; day++) {
    const iso = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const sum = summaryCache[iso];
    const cell = document.createElement("div");
    cell.className = "cal-cell" + (iso === todayIso ? " cal-today" : "");
    cell.style.background = ratingColor(sum?.rating);
    cell.style.color      = ratingTextColor(sum?.rating);
    cell.innerHTML = `<span class="cal-day-num">${day}</span>${sum ? `<span class="cal-rating">${sum.rating}</span>` : ""}`;
    if (sum) {
      cell.style.cursor = "pointer";
      cell.title = `Рейтинг: ${sum.rating} | ${(sum.productivity*100).toFixed(0)}% | ${fmtH(sum.total_minutes)}`;
      cell.addEventListener("click", () => showDayDetail(iso));
    }
    grid.appendChild(cell);
  }
  cal.appendChild(grid);
}

async function showDayDetail(iso) {
  const detail = document.getElementById("day-detail");
  detail.style.display = "block";
  detail.innerHTML = "<em>Загрузка...</em>";
  const res = await fetch(`${API}/days/${iso}`).catch(() => null);
  if (!res || !res.ok) { detail.innerHTML = "Нет данных"; return; }
  const day = await res.json();
  const dateStr = localDate(iso).toLocaleDateString("ru-RU", { weekday:"long", day:"numeric", month:"long" });
  const actRows = day.activities.map(a => `
    <div class="detail-act">
      <span class="detail-act-title">${a.title}</span>
      <span class="detail-tag cat-${a.category}">${CAT_LABELS[a.category]||a.category}</span>
      <span class="detail-tag imp-${a.impact}">${IMPACT_LABELS[a.impact]||a.impact}</span>
      <span class="detail-dur">${a.duration_m} мин</span>
      ${a.note ? `<span class="detail-note">${a.note}</span>` : ""}
    </div>`).join("");
  detail.innerHTML = `
    <div class="detail-header">
      <strong>${dateStr}</strong>
      <span class="detail-rating-badge" style="background:${ratingColor(day.rating)};color:${ratingTextColor(day.rating)}">${day.rating}/10</span>
    </div>
    ${day.note ? `<p class="detail-day-note">${day.note}</p>` : ""}
    <div class="detail-acts">${actRows || "<em>Нет действий</em>"}</div>
    <div style="text-align:right;margin-top:.5rem">
      <button class="btn-secondary" onclick="openLogForDate('${iso}')">✏️ Редактировать</button>
    </div>`;
  detail.scrollIntoView({ behavior:"smooth", block:"nearest" });
}

function openLogForDate(iso) {
  switchPage("log");
  dateInput.value = iso;
  dateLabel.textContent = friendlyDate(iso);
  loadLogPage(iso);
}

async function loadPeriodStats(days) {
  const el = document.getElementById("stats-output");
  el.innerHTML = "<em>Загрузка...</em>";
  const allDates = await fetch(`${API}/days`).then(r => r.json()).catch(() => []);
  const end   = todayIso;
  const start = days >= 90 && allDates.length ? allDates[0] : shiftIso(todayIso, -(days-1));
  try {
    const s = await fetch(`${API}/analytics/stats?start=${start}&end=${end}`).then(r => r.json());
    renderStats(el, s);
  } catch {
    el.textContent = "Нет данных";
  }
}

function renderStats(el, s) {
  if (!s.days_count) { el.innerHTML = "<em>Нет записей за период</em>"; return; }
  const maxCat = Math.max(...Object.values(s.time_by_category), 1);
  const maxImp = Math.max(...Object.values(s.time_by_impact), 1);

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><div class="val">${s.days_count}</div><div class="lbl">Дней записано</div></div>
      <div class="stat-box"><div class="val">${s.avg_rating.toFixed(1)}</div><div class="lbl">Средняя оценка</div></div>
      <div class="stat-box"><div class="val">${(s.avg_productivity*100).toFixed(0)}%</div><div class="lbl">Продуктивность</div></div>
    </div>
    <h3 style="margin-top:1rem">Время по категориям</h3>
    ${Object.entries(s.time_by_category).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `
      <div class="bar-row">
        <span class="bar-label">${CAT_LABELS[k]||k}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(v/maxCat*100).toFixed(1)}%"></div></div>
        <span class="bar-val">${fmtH(v)}</span>
      </div>`).join("")}
    <h3 style="margin-top:1rem">Время по импакту</h3>
    ${Object.entries(s.time_by_impact).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `
      <div class="bar-row">
        <span class="bar-label">${IMPACT_LABELS[k]||k}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(v/maxImp*100).toFixed(1)}%;background:${IMPACT_COLORS[k]||'#999'}"></div></div>
        <span class="bar-val">${fmtH(v)}</span>
      </div>`).join("")}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  await loadHabits();
  await loadLogPage(todayIso);
})();
