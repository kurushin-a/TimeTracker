const API = "http://localhost:8000/api";

// ─── Date utils ───────────────────────────────────────────────────────────────

const todayIso = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
})();

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function localDate(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m-1, d);
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
function fmtMinutes(min) {
  if (!min) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}ч ${m ? m+"м" : ""}`.trim() : `${m}м`;
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
const STATUS_LABELS = { open:"Открыта", in_progress:"В процессе", done:"Выполнена", cancelled:"Отменена",
                        active:"Активная", paused:"На паузе" };
const STATUS_CLASS  = { open:"s-open", in_progress:"s-progress", done:"s-done",
                        cancelled:"s-cancelled", active:"s-open", paused:"s-paused" };

function ratingColor(r) {
  if (!r) return "#f0f0f0";
  if (r <= 3) return "#ffcdd2";
  if (r <= 6) return "#fff9c4";
  if (r <= 8) return "#c8e6c9";
  return "#43a047";
}
function ratingTextColor(r) { return r >= 9 ? "#fff" : "#333"; }

// ─── Global state ─────────────────────────────────────────────────────────────

let habits    = [];
let openTasks = [];   // незавершённые задачи для выпадашки в форме дня
let allGoals  = [];   // для выпадашек

// ─── Navigation ───────────────────────────────────────────────────────────────

function switchPage(name) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === `page-${name}`));
  if (name === "stats")   initStats();
  if (name === "habits")  initHabitsPage();
  if (name === "tasks")   initTasksPage();
  if (name === "goals")   initGoalsPage();
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
  await refreshOpenTasks();
  await Promise.all([loadDayIntoForm(iso), loadDayTasks(iso)]);
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

  // заполняем выпадашку задач
  const sel = row.querySelector(".act-task-id");
  openTasks.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.title.length > 30 ? t.title.slice(0,30)+"…" : t.title;
    sel.appendChild(opt);
  });
  if (data.task_id) sel.value = data.task_id;

  row.querySelector(".act-remove").addEventListener("click", () => row.remove());
  actList.appendChild(row);
}

function collectActivities() {
  return [...actList.querySelectorAll(".activity-row")].map(row => ({
    title:      row.querySelector(".act-title").value.trim(),
    category:   row.querySelector(".act-category").value,
    impact:     row.querySelector(".act-impact").value,
    duration_m: parseInt(row.querySelector(".act-duration").value) || 0,
    task_id:    row.querySelector(".act-task-id").value || null,
    note:       row.querySelector(".act-note").value.trim() || null,
  })).filter(a => a.title && a.duration_m > 0);
}

// Habits in log
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
    const freqLabel = h.frequency === "daily" ? "каждый день" : `${h.times_per_week}× в нед.`;
    row.innerHTML = `
      <input type="checkbox" id="h-${h.id}" value="${h.id}" ${doneIds.includes(h.id) ? "checked" : ""} />
      <label for="h-${h.id}">
        <span class="habit-title">${h.title}</span>
        <span class="habit-freq">${freqLabel}</span>
      </label>`;
    list.appendChild(row);
  });
}

// Rating
const ratingInput = document.getElementById("rating");
const ratingVal   = document.getElementById("rating-val");
ratingInput.addEventListener("input", () => ratingVal.textContent = ratingInput.value);

async function loadDayIntoForm(iso) {
  actList.innerHTML = "";
  ratingInput.value = 7; ratingVal.textContent = 7;
  document.getElementById("note").value = "";
  renderLogHabits([]);
  document.getElementById("save-status").textContent = "";

  const res = await fetch(`${API}/days/${iso}`).catch(() => null);
  if (!res || !res.ok) return;
  const day = await res.json();
  ratingInput.value = day.rating; ratingVal.textContent = day.rating;
  if (day.note) document.getElementById("note").value = day.note;
  day.activities.forEach(addActivityRow);
  renderLogHabits(day.habits_done);
}

// Tasks in log — показываем открытые задачи с чекбоксами
async function loadDayTasks(iso) {
  const el = document.getElementById("day-tasks-list");
  const tasks = await fetch(`${API}/tasks`).then(r => r.json()).catch(() => []);
  const active = tasks.filter(t => t.status !== "done" && t.status !== "cancelled" && !t.parent_task_id);

  if (!active.length) {
    el.innerHTML = "<em class='muted'>Нет активных задач</em>";
    return;
  }
  el.innerHTML = "";
  active.forEach(t => {
    const row = document.createElement("div");
    row.className = "task-row" + (t.status === "done" ? " task-done" : "");
    const est = t.estimated_minutes ? `<span class="task-time-badge">~${fmtMinutes(t.estimated_minutes)}</span>` : "";
    const act = t.actual_minutes    ? `<span class="task-time-badge act">${fmtMinutes(t.actual_minutes)}</span>` : "";
    row.innerHTML = `
      <input type="checkbox" class="task-cb" ${t.status === "done" ? "checked" : ""} />
      <span class="task-title">${t.title}</span>
      <span class="detail-tag cat-${t.category}">${CAT_LABELS[t.category]||t.category}</span>
      ${est}${act}`;
    row.querySelector(".task-cb").addEventListener("change", async (e) => {
      const status = e.target.checked ? "done" : "open";
      await fetch(`${API}/tasks/${t.id}/status?status=${status}`, { method:"PATCH" });
      row.classList.toggle("task-done", e.target.checked);
      await refreshOpenTasks();
    });
    el.appendChild(row);
  });
}

async function refreshOpenTasks() {
  openTasks = await fetch(`${API}/tasks/open`).then(r => r.json()).catch(() => []);
}

// Save day
document.getElementById("save-day-btn").addEventListener("click", async () => {
  const status = document.getElementById("save-status");
  const habits_done = [...document.querySelectorAll("#habits-list input:checked")].map(cb => cb.value);
  const payload = {
    date:       dateInput.value,
    activities: collectActivities(),
    habits_done,
    rating: parseInt(ratingInput.value),
    note:   document.getElementById("note").value.trim() || null,
  };
  status.textContent = "Сохраняю...";
  try {
    const res = await fetch(`${API}/days`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    status.textContent = "✓ День сохранён";
    if (calYear !== undefined) { await refreshSummaryCache(); renderCalendar(); }
  } catch(e) {
    status.textContent = "Ошибка: " + e.message;
  }
});

// ─── GOALS PAGE ───────────────────────────────────────────────────────────────

let currentGoalStatus = "active";
let editingGoalId     = null;
let goalsInited       = false;

async function initGoalsPage() {
  if (!goalsInited) {
    document.getElementById("open-add-goal").onclick = () => openGoalForm();
    document.getElementById("cancel-goal-btn").onclick = () => closeGoalForm();
    document.getElementById("save-goal-btn").onclick   = saveGoal;
    document.getElementById("goal-back-btn").onclick   = () => {
      document.getElementById("goal-detail").style.display = "none";
      document.getElementById("goals-list").style.display  = "block";
      document.querySelectorAll(".page-header, #goal-status-tabs").forEach(el => el.style.display = "");
    };
    document.querySelectorAll("#goal-status-tabs .period-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#goal-status-tabs .period-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentGoalStatus = btn.dataset.status;
        renderGoals();
      });
    });
    goalsInited = true;
  }
  await refreshGoals();
  renderGoals();
}

async function refreshGoals() {
  allGoals = await fetch(`${API}/goals`).then(r => r.json()).catch(() => []);
  // обновляем выпадашки везде
  populateGoalSelects();
}

function populateGoalSelects() {
  ["task-goal-id","habit-goal-id"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">— без цели —</option>`;
    allGoals.filter(g => g.status === "active").forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.id; opt.textContent = g.title;
      sel.appendChild(opt);
    });
    sel.value = cur;
  });
}

function openGoalForm(goal = null) {
  editingGoalId = goal?.id || null;
  document.getElementById("goal-form-title").textContent = goal ? "Редактировать цель" : "Новая цель";
  document.getElementById("goal-title").value       = goal?.title || "";
  document.getElementById("goal-description").value = goal?.description || "";
  document.getElementById("goal-category").value    = goal?.category || "work";
  document.getElementById("goal-status").value      = goal?.status || "active";
  document.getElementById("goal-deadline").value    = goal?.deadline || "";
  document.getElementById("add-goal-form").style.display = "block";
}

function closeGoalForm() {
  document.getElementById("add-goal-form").style.display = "none";
  editingGoalId = null;
}

async function saveGoal() {
  const payload = {
    title:       document.getElementById("goal-title").value.trim(),
    description: document.getElementById("goal-description").value.trim() || null,
    category:    document.getElementById("goal-category").value,
    status:      document.getElementById("goal-status").value,
    deadline:    document.getElementById("goal-deadline").value || null,
  };
  if (!payload.title) return;
  const url    = editingGoalId ? `${API}/goals/${editingGoalId}` : `${API}/goals`;
  const method = editingGoalId ? "PUT" : "POST";
  await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
  closeGoalForm();
  await refreshGoals();
  renderGoals();
}

async function renderGoals() {
  const el = document.getElementById("goals-list");
  el.innerHTML = "<em class='muted'>Загрузка...</em>";

  const progList = await fetch(`${API}/goals/progress`).then(r => r.json()).catch(() => []);
  const filtered = currentGoalStatus
    ? progList.filter(p => p.goal.status === currentGoalStatus)
    : progList;

  el.innerHTML = "";
  if (!filtered.length) {
    el.innerHTML = "<div class='card'><em class='muted'>Нет целей</em></div>";
    return;
  }

  filtered.forEach(p => {
    const g = p.goal;
    const pct = p.tasks_total ? Math.round(p.tasks_done / p.tasks_total * 100) : 0;
    const deadline = g.deadline
      ? `<span class="goal-deadline ${p.days_until_deadline < 7 ? 'urgent' : ''}">
           📅 ${localDate(g.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}
           ${p.days_until_deadline !== null ? `(${p.days_until_deadline} дн.)` : ""}
         </span>`
      : "";
    const habitsHtml = p.linked_habits.length
      ? `<div class="goal-habits">🔄 ${p.linked_habits.map(h => h.title).join(", ")}</div>`
      : "";

    const card = document.createElement("div");
    card.className = "card goal-card";
    card.innerHTML = `
      <div class="goal-card-header">
        <div>
          <span class="goal-title">${g.title}</span>
          <span class="detail-tag cat-${g.category}">${CAT_LABELS[g.category]||g.category}</span>
          <span class="status-badge ${STATUS_CLASS[g.status]||""}">${STATUS_LABELS[g.status]||g.status}</span>
        </div>
        <div class="goal-actions">
          <button class="btn-link" data-edit="${g.id}">✏️</button>
          <button class="btn-link danger" data-del="${g.id}">✕</button>
        </div>
      </div>
      ${g.description ? `<p class="goal-desc">${g.description}</p>` : ""}
      <div class="goal-meta">
        ${deadline}
        <span>⏱ ${fmtMinutes(p.total_minutes)} вложено</span>
        <span>✅ ${p.tasks_done}/${p.tasks_total} задач</span>
      </div>
      ${p.tasks_total ? `
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div style="font-size:.75rem;color:var(--muted)">${pct}%</div>` : ""}
      ${habitsHtml}
      <button class="btn-link goal-open-btn" data-id="${g.id}">Открыть →</button>`;

    card.querySelector("[data-edit]").addEventListener("click", () => openGoalForm(g));
    card.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm(`Удалить цель «${g.title}»?`)) return;
      await fetch(`${API}/goals/${g.id}`, { method:"DELETE" });
      await refreshGoals(); renderGoals();
    });
    card.querySelector(".goal-open-btn").addEventListener("click", () => openGoalDetail(g.id));

    el.appendChild(card);
  });
}

async function openGoalDetail(goalId) {
  document.getElementById("goals-list").style.display = "none";
  document.querySelectorAll("#page-goals .page-header, #goal-status-tabs").forEach(el => el.style.display = "none");
  const detail = document.getElementById("goal-detail");
  detail.style.display = "block";
  const content = document.getElementById("goal-detail-content");
  content.innerHTML = "<em class='muted'>Загрузка...</em>";

  const [prog, tree] = await Promise.all([
    fetch(`${API}/goals/${goalId}/progress`).then(r => r.json()),
    fetch(`${API}/tasks/tree?goal_id=${goalId}`).then(r => r.json()).catch(() => []),
  ]);

  const g = prog.goal;

  function renderNode(node, depth = 0) {
    const t = node.task;
    const indent = depth * 20;
    const est = t.estimated_minutes ? `~${fmtMinutes(t.estimated_minutes)}` : "";
    const act = t.actual_minutes    ? `${fmtMinutes(t.actual_minutes)} факт` : "";
    let html = `
      <div class="tree-node" style="padding-left:${indent}px">
        <span class="status-dot ${STATUS_CLASS[t.status]||""}"></span>
        <span class="tree-title ${t.status==="done"?"line-through":""}">${t.title}</span>
        <span class="detail-tag cat-${t.category}">${CAT_LABELS[t.category]||t.category}</span>
        ${est ? `<span class="task-time-badge">${est}</span>` : ""}
        ${act ? `<span class="task-time-badge act">${act}</span>` : ""}
        <button class="btn-link task-status-toggle" data-id="${t.id}" data-done="${t.status==="done"}">
          ${t.status === "done" ? "↩ Открыть" : "✓ Готово"}
        </button>
      </div>`;
    for (const child of node.children) html += renderNode(child, depth + 1);
    return html;
  }

  const treeHtml = tree.length ? tree.map(n => renderNode(n)).join("") : "<em class='muted'>Нет задач</em>";
  const habitsHtml = prog.linked_habits.length
    ? prog.linked_habits.map(h => `<div class="habit-row"><span class="habit-title">${h.title}</span><span class="habit-freq">${h.frequency === "daily" ? "каждый день" : `${h.times_per_week}× в нед.`}</span></div>`).join("")
    : "<em class='muted'>Нет привычек</em>";

  content.innerHTML = `
    <div class="card" style="margin-top:.5rem">
      <div class="goal-card-header">
        <span class="goal-title">${g.title}</span>
        <span class="status-badge ${STATUS_CLASS[g.status]}">${STATUS_LABELS[g.status]||g.status}</span>
      </div>
      ${g.description ? `<p class="goal-desc">${g.description}</p>` : ""}
      <div class="goal-meta">
        ${g.deadline ? `<span>📅 ${localDate(g.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}</span>` : ""}
        <span>⏱ ${fmtMinutes(prog.total_minutes)} вложено</span>
        <span>✅ ${prog.tasks_done}/${prog.tasks_total} задач</span>
      </div>
    </div>
    <div class="card">
      <h3>Задачи</h3>
      <div class="task-tree">${treeHtml}</div>
      <button class="btn-secondary" style="margin-top:.5rem" onclick="switchPage('tasks')">+ Добавить задачу</button>
    </div>
    <div class="card">
      <h3>Привычки</h3>
      ${habitsHtml}
    </div>`;

  content.querySelectorAll(".task-status-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const isDone = btn.dataset.done === "true";
      await fetch(`${API}/tasks/${btn.dataset.id}/status?status=${isDone ? "open" : "done"}`, { method:"PATCH" });
      openGoalDetail(goalId);
    });
  });
}

// ─── TASKS PAGE ───────────────────────────────────────────────────────────────

let tasksInited     = false;
let taskFilterStatus = "open,in_progress";

async function initTasksPage() {
  await refreshGoals();
  if (!tasksInited) {
    document.getElementById("open-add-task").onclick   = () => document.getElementById("add-task-form").style.display = "block";
    document.getElementById("cancel-task-btn").onclick = () => document.getElementById("add-task-form").style.display = "none";
    document.getElementById("save-task-btn").onclick   = saveTask;
    document.querySelectorAll("[data-task-status]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-task-status]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        taskFilterStatus = btn.dataset.taskStatus;
        renderTasks();
      });
    });
    tasksInited = true;
  }
  populateGoalSelects();
  renderTasks();
}

async function renderTasks() {
  const el = document.getElementById("tasks-list");
  el.innerHTML = "<em class='muted'>Загрузка...</em>";
  let tasks = await fetch(`${API}/tasks`).then(r => r.json()).catch(() => []);

  // фильтруем только верхнеуровневые
  tasks = tasks.filter(t => !t.parent_task_id);
  if (taskFilterStatus) {
    const allowed = taskFilterStatus.split(",");
    tasks = tasks.filter(t => allowed.includes(t.status));
  }

  if (!tasks.length) {
    el.innerHTML = "<div class='card'><em class='muted'>Нет задач</em></div>";
    return;
  }

  el.innerHTML = "";
  tasks.forEach(t => {
    const goalName = allGoals.find(g => g.id === t.goal_id)?.title;
    const est = t.estimated_minutes ? fmtMinutes(t.estimated_minutes) : null;
    const act = t.actual_minutes    ? fmtMinutes(t.actual_minutes)    : null;
    const efficiency = (t.estimated_minutes && t.actual_minutes)
      ? Math.round(t.actual_minutes / t.estimated_minutes * 100) : null;

    const card = document.createElement("div");
    card.className = "card task-card";
    card.innerHTML = `
      <div class="task-card-header">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <span class="status-dot ${STATUS_CLASS[t.status]||""}"></span>
          <span class="task-card-title">${t.title}</span>
          <span class="detail-tag cat-${t.category}">${CAT_LABELS[t.category]||t.category}</span>
          ${goalName ? `<span class="goal-ref">🎯 ${goalName}</span>` : ""}
        </div>
        <div class="goal-actions">
          <button class="btn-link danger task-del" data-id="${t.id}">✕</button>
        </div>
      </div>
      ${t.note ? `<div class="task-note-text">${t.note}</div>` : ""}
      <div class="task-time-row">
        ${est ? `<span class="task-time-badge">план: ${est}</span>` : ""}
        ${act ? `<span class="task-time-badge act">факт: ${act}</span>` : ""}
        ${efficiency !== null ? `<span class="task-time-badge ${efficiency > 100 ? "over" : ""}">эфф: ${efficiency}%</span>` : ""}
        ${t.deadline ? `<span class="task-time-badge">📅 ${localDate(t.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>` : ""}
      </div>
      <div class="task-status-row">
        ${["open","in_progress","done"].map(s =>
          `<button class="status-btn ${t.status===s?"active":""}" data-id="${t.id}" data-s="${s}">${STATUS_LABELS[s]}</button>`
        ).join("")}
      </div>`;

    card.querySelectorAll(".status-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        await fetch(`${API}/tasks/${btn.dataset.id}/status?status=${btn.dataset.s}`, { method:"PATCH" });
        renderTasks();
        await refreshOpenTasks();
      });
    });
    card.querySelector(".task-del").addEventListener("click", async () => {
      if (!confirm(`Удалить задачу «${t.title}»?`)) return;
      await fetch(`${API}/tasks/${t.id}`, { method:"DELETE" });
      renderTasks();
    });
    el.appendChild(card);
  });
}

async function saveTask() {
  const payload = {
    title:             document.getElementById("task-title").value.trim(),
    category:          document.getElementById("task-category").value,
    deadline:          document.getElementById("task-deadline").value || null,
    estimated_minutes: parseInt(document.getElementById("task-estimated").value) || null,
    goal_id:           document.getElementById("task-goal-id").value || null,
    note:              document.getElementById("task-note").value.trim() || null,
    status:            "open",
  };
  if (!payload.title) return;
  await fetch(`${API}/tasks`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  document.getElementById("task-title").value = "";
  document.getElementById("task-estimated").value = "";
  document.getElementById("task-note").value = "";
  document.getElementById("add-task-form").style.display = "none";
  renderTasks();
  await refreshOpenTasks();
}

// ─── HABITS PAGE ──────────────────────────────────────────────────────────────

async function initHabitsPage() {
  await refreshGoals();
  document.getElementById("open-add-habit").onclick   = () => document.getElementById("add-habit-form").style.display = "block";
  document.getElementById("cancel-habit-btn").onclick = () => document.getElementById("add-habit-form").style.display = "none";
  document.getElementById("save-habit-btn").onclick   = saveHabit;
  document.getElementById("habit-frequency").addEventListener("change", (e) => {
    document.getElementById("times-per-week-label").style.display = e.target.value === "weekly" ? "block" : "none";
  });
  populateGoalSelects();
  renderHabitsPage();
}

async function renderHabitsPage() {
  const el = document.getElementById("habits-page-list");
  el.innerHTML = "<em class='muted'>Загрузка...</em>";
  const end   = todayIso;
  const start = shiftIso(todayIso, -27);
  const [habitList, stats] = await Promise.all([
    fetch(`${API}/habits`).then(r => r.json()).catch(() => []),
    fetch(`${API}/analytics/stats?start=${start}&end=${end}`).then(r => r.json()).catch(() => ({habit_stats:[]})),
  ]);
  habits = habitList;
  if (!habitList.length) {
    el.innerHTML = "<div class='card'><em class='muted'>Нет привычек. Добавьте первую!</em></div>";
    return;
  }
  const statsMap = {};
  (stats.habit_stats||[]).forEach(s => { statsMap[s.habit.id] = s; });
  const dates28 = [];
  for (let i = 27; i >= 0; i--) dates28.push(shiftIso(todayIso, -i));

  el.innerHTML = "";
  habitList.forEach(h => {
    const s    = statsMap[h.id];
    const done = new Set(s?.done_dates||[]);
    const streak = s?.streak||0;
    const rate   = s ? Math.round(s.completion_rate*100) : 0;
    const freqLabel = h.frequency === "daily" ? "Каждый день" : `${h.times_per_week}× в нед.`;
    const goalName  = allGoals.find(g => g.id === h.goal_id)?.title;
    const cells = dates28.map(iso => {
      const d = localDate(iso);
      return `<div class="heat-cell ${done.has(iso)?"heat-done":"heat-empty"}" title="${d.toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}"></div>`;
    }).join("");

    const card = document.createElement("div");
    card.className = "card habit-card";
    card.innerHTML = `
      <div class="habit-card-header">
        <div>
          <span class="habit-card-title">${h.title}</span>
          <span class="detail-tag cat-${h.category}">${CAT_LABELS[h.category]||h.category}</span>
          ${goalName ? `<span class="goal-ref">🎯 ${goalName}</span>` : ""}
        </div>
        <button class="act-remove" data-id="${h.id}" title="Удалить">✕</button>
      </div>
      <div class="habit-meta">
        <span>${freqLabel}</span>
        <span>🔥 Серия: <b>${streak}</b> ${h.frequency==="daily"?"дн.":"нед."}</span>
        <span>✅ <b>${rate}%</b> за 28 дн.</span>
      </div>
      <div class="heat-map">${cells}</div>
      <div class="heat-labels">
        <span>${localDate(dates28[0]).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>
        <span>${localDate(dates28[dates28.length-1]).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>
      </div>`;

    card.querySelector("[data-id]").addEventListener("click", async () => {
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
    goal_id:        document.getElementById("habit-goal-id").value || null,
    note:           document.getElementById("habit-note").value.trim() || null,
  };
  if (!payload.title) return;
  await fetch(`${API}/habits`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
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
  const sums = await fetch(`${API}/analytics/summaries?start=${allDates[0]}&end=${todayIso}`)
                      .then(r => r.json()).catch(() => []);
  summaryCache = {};
  sums.forEach(s => { summaryCache[s.date] = s; });
}

async function initStats() {
  if (!statsInited) {
    const now = new Date();
    calYear = now.getFullYear(); calMonth = now.getMonth();
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
  RU_DAYS.forEach(d => { const c = document.createElement("div"); c.className="cal-dow"; c.textContent=d; header.appendChild(c); });
  cal.appendChild(header);
  const grid = document.createElement("div");
  grid.className = "cal-grid";
  const firstDay = new Date(calYear, calMonth, 1);
  const totalDays = new Date(calYear, calMonth+1, 0).getDate();
  const dow = (firstDay.getDay()+6)%7;
  for (let i=0;i<dow;i++) { const e=document.createElement("div"); e.className="cal-cell cal-empty"; grid.appendChild(e); }
  for (let day=1;day<=totalDays;day++) {
    const iso=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const sum=summaryCache[iso];
    const cell=document.createElement("div");
    cell.className="cal-cell"+(iso===todayIso?" cal-today":"");
    cell.style.background=ratingColor(sum?.rating); cell.style.color=ratingTextColor(sum?.rating);
    cell.innerHTML=`<span class="cal-day-num">${day}</span>${sum?`<span class="cal-rating">${sum.rating}</span>`:""}`;
    if(sum){ cell.style.cursor="pointer"; cell.title=`Рейтинг:${sum.rating}|${(sum.productivity*100).toFixed(0)}%|${fmtMinutes(sum.total_minutes)}`; cell.addEventListener("click",()=>showDayDetail(iso)); }
    grid.appendChild(cell);
  }
  cal.appendChild(grid);
}

async function showDayDetail(iso) {
  const detail=document.getElementById("day-detail");
  detail.style.display="block"; detail.innerHTML="<em>Загрузка...</em>";
  const res=await fetch(`${API}/days/${iso}`).catch(()=>null);
  if(!res||!res.ok){detail.innerHTML="Нет данных";return;}
  const day=await res.json();
  const dateStr=localDate(iso).toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"});
  const actRows=day.activities.map(a=>`
    <div class="detail-act">
      <span class="detail-act-title">${a.title}</span>
      <span class="detail-tag cat-${a.category}">${CAT_LABELS[a.category]||a.category}</span>
      <span class="detail-tag imp-${a.impact}">${IMPACT_LABELS[a.impact]||a.impact}</span>
      <span class="detail-dur">${a.duration_m}м</span>
      ${a.note?`<span class="detail-note">${a.note}</span>`:""}
    </div>`).join("");
  detail.innerHTML=`
    <div class="detail-header">
      <strong>${dateStr}</strong>
      <span class="detail-rating-badge" style="background:${ratingColor(day.rating)};color:${ratingTextColor(day.rating)}">${day.rating}/10</span>
    </div>
    ${day.note?`<p class="detail-day-note">${day.note}</p>`:""}
    <div class="detail-acts">${actRows||"<em>Нет действий</em>"}</div>
    <div style="text-align:right;margin-top:.5rem">
      <button class="btn-secondary" onclick="openLogForDate('${iso}')">✏️ Редактировать</button>
    </div>`;
  detail.scrollIntoView({behavior:"smooth",block:"nearest"});
}

function openLogForDate(iso) {
  switchPage("log");
  dateInput.value=iso; dateLabel.textContent=friendlyDate(iso);
  loadLogPage(iso);
}

async function loadPeriodStats(days) {
  const el=document.getElementById("stats-output");
  el.innerHTML="<em>Загрузка...</em>";
  const allDates=await fetch(`${API}/days`).then(r=>r.json()).catch(()=>[]);
  const end=todayIso;
  const start=days>=90&&allDates.length?allDates[0]:shiftIso(todayIso,-(days-1));
  try {
    const s=await fetch(`${API}/analytics/stats?start=${start}&end=${end}`).then(r=>r.json());
    renderStats(el,s);
  } catch { el.textContent="Нет данных"; }
}

function renderStats(el,s) {
  if(!s.days_count){el.innerHTML="<em>Нет записей за период</em>";return;}
  const maxCat=Math.max(...Object.values(s.time_by_category),1);
  const maxImp=Math.max(...Object.values(s.time_by_impact),1);
  el.innerHTML=`
    <div class="stat-grid">
      <div class="stat-box"><div class="val">${s.days_count}</div><div class="lbl">Дней записано</div></div>
      <div class="stat-box"><div class="val">${s.avg_rating.toFixed(1)}</div><div class="lbl">Средняя оценка</div></div>
      <div class="stat-box"><div class="val">${(s.avg_productivity*100).toFixed(0)}%</div><div class="lbl">Продуктивность</div></div>
    </div>
    <h3 style="margin-top:1rem">Время по категориям</h3>
    ${Object.entries(s.time_by_category).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
      <div class="bar-row"><span class="bar-label">${CAT_LABELS[k]||k}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(v/maxCat*100).toFixed(1)}%"></div></div>
      <span class="bar-val">${fmtMinutes(v)}</span></div>`).join("")}
    <h3 style="margin-top:1rem">Время по импакту</h3>
    ${Object.entries(s.time_by_impact).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
      <div class="bar-row"><span class="bar-label">${IMPACT_LABELS[k]||k}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(v/maxImp*100).toFixed(1)}%;background:${IMPACT_COLORS[k]||"#999"}"></div></div>
      <span class="bar-val">${fmtMinutes(v)}</span></div>`).join("")}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  await Promise.all([loadHabits(), refreshGoals(), refreshOpenTasks()]);
  await loadLogPage(todayIso);
})();
