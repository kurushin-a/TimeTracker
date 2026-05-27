const API = "http://localhost:8000/api";

// ─── Date utils ───────────────────────────────────────────────────────────────

const todayIso = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
})();

function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function localDate(iso) { const [y,m,d]=iso.split("-").map(Number); return new Date(y,m-1,d); }
function shiftIso(iso, delta) { const d=localDate(iso); d.setDate(d.getDate()+delta); return isoOf(d); }
function friendlyDate(iso) {
  if(iso===todayIso) return "сегодня";
  if(iso===shiftIso(todayIso,-1)) return "вчера";
  return localDate(iso).toLocaleDateString("ru-RU",{day:"numeric",month:"long"});
}
function fmtMinutes(min) {
  if(!min) return "—";
  const h=Math.floor(min/60), m=min%60;
  return h ? `${h}ч${m?" "+m+"м":""}` : `${m}м`;
}

// ─── Dictionaries ─────────────────────────────────────────────────────────────

const RU_MONTHS=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const RU_DAYS=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const CAT_LABELS={work:"Работа",learning:"Обучение",health:"Здоровье",relations:"Отношения",rest:"Отдых",chores:"Быт",other:"Другое"};
const IMPACT_LABELS={useful:"Полезное",necessary:"Необходимое",pleasant:"Приятное",wasteful:"Впустую"};
const IMPACT_COLORS={useful:"#43a047",necessary:"#1e88e5",pleasant:"#fb8c00",wasteful:"#e53935"};
const STATUS_LABELS={open:"Открыта",done:"Выполнена",cancelled:"Отменена",active:"Активная",paused:"На паузе"};
const STATUS_CLASS={open:"s-open",done:"s-done",cancelled:"s-cancelled",active:"s-open",paused:"s-paused"};

function ratingColor(r){if(!r)return"#f0f0f0";if(r<=3)return"#ffcdd2";if(r<=6)return"#fff9c4";if(r<=8)return"#c8e6c9";return"#43a047";}
function ratingTextColor(r){return r>=9?"#fff":"#333";}

// ─── Global state ─────────────────────────────────────────────────────────────

let habits=[], allGoals=[], allOpenTasks=[];

// ─── Navigation ───────────────────────────────────────────────────────────────

function switchPage(name) {
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${name}`));
  if(name==="stats")  initStats();
  if(name==="habits") initHabitsPage();
  if(name==="tasks")  initTasksPage();
  if(name==="goals")  initGoalsPage();
}
document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>switchPage(btn.dataset.page)));

// ─── LOG PAGE ─────────────────────────────────────────────────────────────────

const dateInput=document.getElementById("selected-date");
const dateLabel=document.getElementById("date-label");
dateInput.value=todayIso; dateLabel.textContent="сегодня";

dateInput.addEventListener("change",()=>{dateLabel.textContent=friendlyDate(dateInput.value);loadLogPage(dateInput.value);});
document.getElementById("date-prev").addEventListener("click",()=>{dateInput.value=shiftIso(dateInput.value,-1);dateLabel.textContent=friendlyDate(dateInput.value);loadLogPage(dateInput.value);});
document.getElementById("date-next").addEventListener("click",()=>{const n=shiftIso(dateInput.value,1);if(n>todayIso)return;dateInput.value=n;dateLabel.textContent=friendlyDate(n);loadLogPage(n);});

async function loadLogPage(iso) {
  await refreshOpenTasks();
  await Promise.all([
    loadDayIntoForm(iso),
    loadPlanForDay(iso),
    loadSuggestions(iso),
    checkUnresolved(iso),
  ]);
}

// ── Unresolved banner ─────────────────────────────────────────────────────────

async function checkUnresolved(iso) {
  const banner = document.getElementById("unresolved-banner");
  // только для сегодня
  if (iso !== todayIso) { banner.style.display="none"; return; }
  const items = await fetch(`${API}/plan/unresolved?today=${iso}`).then(r=>r.json()).catch(()=>[]);
  if (!items.length) { banner.style.display="none"; return; }

  banner.style.display = "block";
  banner.innerHTML = `<div class="unresolved-title">⚠️ Вчера не выполнено: ${items.length} задач</div>
    <div class="unresolved-list">${items.map(p=>`
      <div class="unresolved-item">
        <span class="unresolved-name">${p.title}</span>
        <button class="btn-link" data-id="${p.id}" data-action="move">Перенести на сегодня</button>
        <button class="btn-link muted" data-id="${p.id}" data-action="backlog">В беклог</button>
      </div>`).join("")}
    </div>`;

  banner.querySelectorAll("[data-action='move']").forEach(btn=>btn.addEventListener("click", async()=>{
    await fetch(`${API}/plan/${btn.dataset.id}/reschedule?new_date=${todayIso}`,{method:"POST"});
    await loadPlanForDay(iso);
    checkUnresolved(iso);
  }));
  banner.querySelectorAll("[data-action='backlog']").forEach(btn=>btn.addEventListener("click", async()=>{
    await fetch(`${API}/plan/${btn.dataset.id}`,{method:"DELETE"});
    checkUnresolved(iso);
  }));
}

// ── Plan for day ──────────────────────────────────────────────────────────────

async function loadPlanForDay(iso) {
  const el = document.getElementById("plan-list");
  const items = await fetch(`${API}/plan?d=${iso}`).then(r=>r.json()).catch(()=>[]);
  renderPlanList(el, items, iso);
}

function renderPlanList(el, items, iso) {
  if (!items.length) {
    el.innerHTML = "<em class='muted'>План пуст — добавьте задачи</em>";
    return;
  }
  el.innerHTML = "";
  items.forEach(p => {
    const isDone    = p.status === "done";
    const isSkipped = p.status === "skipped";
    const row = document.createElement("div");
    row.className = `plan-item ${isDone?"plan-done":""} ${isSkipped?"plan-skipped":""}`;
    row.innerHTML = `
      <div class="plan-item-left">
        <button class="plan-check ${isDone?"checked":""}" data-id="${p.id}" data-done="${isDone}" title="${isDone?"Отменить":"Выполнено"}">
          ${isDone?"✓":"○"}
        </button>
        <span class="plan-title">${p.title}</span>
        <span class="detail-tag cat-${p.category}">${CAT_LABELS[p.category]||p.category}</span>
        ${p.estimated_minutes?`<span class="plan-est">${fmtMinutes(p.estimated_minutes)}</span>`:""}
      </div>
      <div class="plan-item-right">
        ${!isDone&&!isSkipped?`<button class="btn-link muted plan-skip" data-id="${p.id}" title="Пропустить">—</button>`:""}
        <button class="btn-link danger plan-del" data-id="${p.id}" title="Удалить">✕</button>
      </div>`;

    // выполнить / снять выполнение
    row.querySelector(".plan-check").addEventListener("click", async btn => {
      const itemId = btn.currentTarget.dataset.id;
      const wasDone = btn.currentTarget.dataset.done === "true";
      if (wasDone) {
        // пока просто удаляем и пересоздаём — простейший вариант
        await fetch(`${API}/plan/${itemId}`,{method:"DELETE"});
      } else {
        // спрашиваем фактическое время
        const actual = prompt(`Фактическое время выполнения (мин)?\nПо умолчанию: ${p.estimated_minutes||30}`, p.estimated_minutes||30);
        if (actual === null) return;
        await fetch(`${API}/plan/${itemId}/complete?actual_minutes=${parseInt(actual)||p.estimated_minutes||30}`,{method:"POST"});
        // перезагружаем действия
        await loadDayIntoForm(iso);
      }
      loadPlanForDay(iso);
    });

    row.querySelector(".plan-skip")?.addEventListener("click", async()=>{
      await fetch(`${API}/plan/${p.id}/skip`,{method:"POST"});
      loadPlanForDay(iso);
    });
    row.querySelector(".plan-del").addEventListener("click", async()=>{
      await fetch(`${API}/plan/${p.id}`,{method:"DELETE"});
      loadPlanForDay(iso);
    });

    el.appendChild(row);
  });
}

// ── Plan form ────────────────────────────────────────────────────────────────

document.getElementById("open-add-plan-item").addEventListener("click", async () => {
  const form = document.getElementById("add-plan-form");
  form.style.display = form.style.display==="none" ? "block" : "none";
  if (form.style.display === "block") await populatePlanPicker();
});

document.getElementById("cancel-plan-item-btn").addEventListener("click", ()=>{
  document.getElementById("add-plan-form").style.display = "none";
});

document.getElementById("save-plan-item-btn").addEventListener("click", async () => {
  const title = document.getElementById("plan-title").value.trim();
  if (!title) return;
  const payload = {
    date:              dateInput.value,
    title,
    category:          document.getElementById("plan-category").value,
    estimated_minutes: parseInt(document.getElementById("plan-estimated").value)||null,
    task_id:           null,
  };
  await fetch(`${API}/plan`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  document.getElementById("plan-title").value = "";
  document.getElementById("plan-estimated").value = "";
  document.getElementById("add-plan-form").style.display = "none";
  loadPlanForDay(dateInput.value);
});

document.getElementById("plan-pick-btn").addEventListener("click", async () => {
  const sel = document.getElementById("plan-pick-task");
  const taskId = sel.value;
  if (!taskId) return;
  const task = allOpenTasks.find(t=>t.id===taskId);
  if (!task) return;
  const payload = {
    date:              dateInput.value,
    title:             task.title,
    category:          task.category,
    estimated_minutes: task.estimated_minutes||null,
    task_id:           task.id,
  };
  await fetch(`${API}/plan`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  sel.value = "";
  document.getElementById("add-plan-form").style.display = "none";
  loadPlanForDay(dateInput.value);
});

async function populatePlanPicker() {
  await refreshOpenTasks();
  const sel = document.getElementById("plan-pick-task");
  sel.innerHTML = `<option value="">— задача из беклога/целей —</option>`;
  allOpenTasks.forEach(t=>{
    const opt=document.createElement("option");
    opt.value=t.id;
    const goal = allGoals.find(g=>g.id===t.goal_id);
    opt.textContent = goal ? `[${goal.title}] ${t.title}` : t.title;
    sel.appendChild(opt);
  });
}

async function refreshOpenTasks() {
  allOpenTasks = await fetch(`${API}/tasks/open`).then(r=>r.json()).catch(()=>[]);
}

// ── Suggestions ───────────────────────────────────────────────────────────────

async function loadSuggestions(iso) {
  const data=await fetch(`${API}/days/suggestions?current_date=${iso}`).then(r=>r.json()).catch(()=>({yesterday:[],frequent:[]}));
  renderSuggestions(data,iso);
}

function renderSuggestions({yesterday,frequent},iso) {
  const el=document.getElementById("suggestions-block"); if(!el)return;
  if(!yesterday.length&&!frequent.length){el.style.display="none";return;}
  el.style.display="block"; el.innerHTML="";
  if(yesterday.length){
    const btn=document.createElement("button"); btn.className="suggest-repeat-btn btn-secondary";
    btn.textContent=`↩ Повторить ${friendlyDate(shiftIso(iso,-1))} (${yesterday.length} действий)`;
    btn.addEventListener("click",()=>{yesterday.forEach(a=>addActivityRow(a));btn.remove();}); el.appendChild(btn);
  }
  if(frequent.length){
    const label=document.createElement("div"); label.className="suggest-label"; label.textContent="Быстро добавить:"; el.appendChild(label);
    const pills=document.createElement("div"); pills.className="suggest-pills";
    frequent.forEach(a=>{
      const pill=document.createElement("button"); pill.className=`suggest-pill imp-bg-${a.impact}`;
      pill.innerHTML=`<span class="pill-title">${a.title}</span><span class="pill-time">${fmtMinutes(a.duration_m)}</span>`;
      pill.title=`${CAT_LABELS[a.category]||a.category} · ${IMPACT_LABELS[a.impact]||a.impact} · ${a.count}× за 30 дн.`;
      pill.addEventListener("click",()=>{addActivityRow(a);pill.classList.add("pill-added");pill.disabled=true;});
      pills.appendChild(pill);
    }); el.appendChild(pills);
  }
}

// ── Activities ────────────────────────────────────────────────────────────────

const actList=document.getElementById("activities-list");
const actTpl=document.getElementById("activity-tpl");
document.getElementById("add-activity-btn").addEventListener("click",()=>addActivityRow());

function addActivityRow(data={}) {
  const row=actTpl.content.cloneNode(true).querySelector(".activity-row");
  if(data.title)      row.querySelector(".act-title").value=data.title;
  if(data.category)   row.querySelector(".act-category").value=data.category;
  if(data.impact)     row.querySelector(".act-impact").value=data.impact;
  if(data.duration_m) row.querySelector(".act-duration").value=data.duration_m;
  if(data.note)       row.querySelector(".act-note").value=data.note;
  row.querySelector(".act-remove").addEventListener("click",()=>row.remove());
  actList.appendChild(row);
}

function collectActivities() {
  return [...actList.querySelectorAll(".activity-row")].map(row=>({
    title:row.querySelector(".act-title").value.trim(),
    category:row.querySelector(".act-category").value,
    impact:row.querySelector(".act-impact").value,
    duration_m:parseInt(row.querySelector(".act-duration").value)||0,
    note:row.querySelector(".act-note").value.trim()||null,
  })).filter(a=>a.title&&a.duration_m>0);
}

// ── Habits in log ─────────────────────────────────────────────────────────────

async function loadHabits(){habits=await fetch(`${API}/habits`).then(r=>r.json()).catch(()=>[]);}

function renderLogHabits(doneIds=[]) {
  const list=document.getElementById("habits-list"); list.innerHTML="";
  if(!habits.length){list.innerHTML=`<em class="muted">Нет привычек. <button class="btn-link" onclick="switchPage('habits')">Добавить</button></em>`;return;}
  habits.forEach(h=>{
    const row=document.createElement("div"); row.className="habit-row";
    row.innerHTML=`<input type="checkbox" id="h-${h.id}" value="${h.id}" ${doneIds.includes(h.id)?"checked":""}/>
      <label for="h-${h.id}"><span class="habit-title">${h.title}</span><span class="habit-freq">${h.frequency==="daily"?"каждый день":`${h.times_per_week}× в нед.`}</span></label>`;
    list.appendChild(row);
  });
}

// ── Rating ────────────────────────────────────────────────────────────────────

const ratingInput=document.getElementById("rating");
const ratingVal=document.getElementById("rating-val");
ratingInput.addEventListener("input",()=>ratingVal.textContent=ratingInput.value);

// ── Load day ─────────────────────────────────────────────────────────────────

async function loadDayIntoForm(iso) {
  actList.innerHTML=""; sleepList.innerHTML="";
  ratingInput.value=7; ratingVal.textContent=7;
  document.getElementById("note").value="";
  document.getElementById("sleep-summary").style.display="none";
  renderLogHabits([]);
  document.getElementById("save-status").textContent="";

  const res=await fetch(`${API}/days/${iso}`).catch(()=>null);
  if(!res||!res.ok) return;
  const day=await res.json();
  ratingInput.value=day.rating; ratingVal.textContent=day.rating;
  if(day.note) document.getElementById("note").value=day.note;
  day.activities.forEach(addActivityRow);
  renderLogHabits(day.habits_done);
  (day.sleep_sessions||[]).forEach(s=>addSleepRow(s));
}

// ── Sleep sessions ────────────────────────────────────────────────────────────

const sleepList=document.getElementById("sleep-sessions-list");
const sleepTpl=document.getElementById("sleep-tpl");
document.getElementById("add-sleep-btn").addEventListener("click",()=>addSleepRow());

function addSleepRow(data={}) {
  const row=sleepTpl.content.cloneNode(true).querySelector(".sleep-row");
  const sleepDateIn=row.querySelector(".sleep-date"), sleepTimeIn=row.querySelector(".sleep-time");
  const wakeDateIn=row.querySelector(".wake-date"),   wakeTimeIn=row.querySelector(".wake-time");
  const badge=row.querySelector(".sleep-duration-badge");
  sleepDateIn.value=data.sleep_date||shiftIso(dateInput.value,-1);
  sleepTimeIn.value=data.sleep_time||"23:00";
  wakeDateIn.value=data.wake_date||dateInput.value;
  wakeTimeIn.value=data.wake_time||"07:00";
  function updateBadge(){
    try{
      const start=new Date(`${sleepDateIn.value}T${sleepTimeIn.value}`);
      const end=new Date(`${wakeDateIn.value}T${wakeTimeIn.value}`);
      const diff=Math.round((end-start)/60000);
      badge.textContent=diff>0?fmtMinutes(diff):"?";
      badge.className="sleep-duration-badge"+(diff>0?" ok":" err");
    }catch{badge.textContent="?";}
  }
  [sleepDateIn,sleepTimeIn,wakeDateIn,wakeTimeIn].forEach(el=>el.addEventListener("change",updateBadge));
  updateBadge();
  row.querySelector(".sleep-remove").addEventListener("click",()=>{row.remove();updateSleepSummary();});
  row.addEventListener("change",updateSleepSummary);
  sleepList.appendChild(row);
  updateSleepSummary();
}

function collectSleepSessions(){
  return [...sleepList.querySelectorAll(".sleep-row")].map(row=>({
    sleep_date:row.querySelector(".sleep-date").value,
    sleep_time:row.querySelector(".sleep-time").value,
    wake_date:row.querySelector(".wake-date").value,
    wake_time:row.querySelector(".wake-time").value,
  })).filter(s=>s.sleep_date&&s.sleep_time&&s.wake_date&&s.wake_time);
}

function updateSleepSummary(){
  const el=document.getElementById("sleep-summary");
  const sessions=collectSleepSessions();
  if(!sessions.length){el.style.display="none";return;}
  const iso=dateInput.value;
  const before=sessions.filter(s=>s.wake_date===iso);
  const all=[...new Map(sessions.filter(s=>s.wake_date===iso||s.sleep_date===iso).map(s=>[`${s.sleep_date}${s.sleep_time}`,s])).values()];
  const calcMin=s=>{const start=new Date(`${s.sleep_date}T${s.sleep_time}`),end=new Date(`${s.wake_date}T${s.wake_time}`);return Math.max(0,Math.round((end-start)/60000));};
  const beforeMin=before.reduce((acc,s)=>acc+calcMin(s),0);
  const totalMin=all.reduce((acc,s)=>acc+calcMin(s),0);
  const lastWake=before.sort((a,b)=>a.wake_time>b.wake_time?1:-1).at(-1)?.wake_time;
  const awakeMin=beforeMin?24*60-beforeMin:null;
  el.style.display="flex";
  el.innerHTML=`
    <div class="sleep-stat"><span class="sleep-stat-val">${fmtMinutes(beforeMin)||"—"}</span><span class="sleep-stat-lbl">сон до дня</span></div>
    <div class="sleep-stat"><span class="sleep-stat-val">${fmtMinutes(totalMin)||"—"}</span><span class="sleep-stat-lbl">общий сон</span></div>
    ${lastWake?`<div class="sleep-stat"><span class="sleep-stat-val">${lastWake}</span><span class="sleep-stat-lbl">подъём</span></div>`:""}
    ${awakeMin?`<div class="sleep-stat"><span class="sleep-stat-val">${fmtMinutes(awakeMin)}</span><span class="sleep-stat-lbl">бодрствование</span></div>`:""}`;
}

// ── Save day ──────────────────────────────────────────────────────────────────

document.getElementById("save-day-btn").addEventListener("click",async()=>{
  const status=document.getElementById("save-status");
  const habits_done=[...document.querySelectorAll("#habits-list input:checked")].map(cb=>cb.value);
  const payload={date:dateInput.value,activities:collectActivities(),habits_done,rating:parseInt(ratingInput.value),note:document.getElementById("note").value.trim()||null,sleep_sessions:collectSleepSessions()};
  status.textContent="Сохраняю...";
  try{
    const res=await fetch(`${API}/days`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!res.ok) throw new Error(await res.text());
    status.textContent="✓ День сохранён";
    if(calYear!==undefined){await refreshSummaryCache();renderCalendar();}
  }catch(e){status.textContent="Ошибка: "+e.message;}
});

// ─── GOALS PAGE ───────────────────────────────────────────────────────────────

let currentGoalStatus="active",editingGoalId=null,goalsInited=false;

async function initGoalsPage(){
  if(!goalsInited){
    document.getElementById("open-add-goal").onclick=()=>openGoalForm();
    document.getElementById("cancel-goal-btn").onclick=()=>closeGoalForm();
    document.getElementById("save-goal-btn").onclick=saveGoal;
    document.getElementById("goal-back-btn").onclick=()=>{
      document.getElementById("goal-detail").style.display="none";
      document.getElementById("goals-list").style.display="block";
      document.querySelectorAll(".page-header,#goal-status-tabs").forEach(e=>e.style.display="");
    };
    document.querySelectorAll("#goal-status-tabs .period-btn").forEach(btn=>{
      btn.addEventListener("click",()=>{document.querySelectorAll("#goal-status-tabs .period-btn").forEach(b=>b.classList.remove("active"));btn.classList.add("active");currentGoalStatus=btn.dataset.status;renderGoals();});
    });
    goalsInited=true;
  }
  await refreshGoals(); renderGoals();
}

async function refreshGoals(){
  allGoals=await fetch(`${API}/goals`).then(r=>r.json()).catch(()=>[]);
  populateGoalSelects();
}

function populateGoalSelects(){
  ["task-goal-id","habit-goal-id"].forEach(id=>{
    const sel=document.getElementById(id); if(!sel)return;
    const cur=sel.value; sel.innerHTML=`<option value="">— без цели —</option>`;
    allGoals.filter(g=>g.status==="active").forEach(g=>{const o=document.createElement("option");o.value=g.id;o.textContent=g.title;sel.appendChild(o);});
    sel.value=cur;
  });
}

function openGoalForm(goal=null){
  editingGoalId=goal?.id||null;
  document.getElementById("goal-form-title").textContent=goal?"Редактировать цель":"Новая цель";
  document.getElementById("goal-title").value=goal?.title||"";
  document.getElementById("goal-description").value=goal?.description||"";
  document.getElementById("goal-category").value=goal?.category||"work";
  document.getElementById("goal-status").value=goal?.status||"active";
  document.getElementById("goal-deadline").value=goal?.deadline||"";
  document.getElementById("add-goal-form").style.display="block";
}
function closeGoalForm(){document.getElementById("add-goal-form").style.display="none";editingGoalId=null;}

async function saveGoal(){
  const payload={title:document.getElementById("goal-title").value.trim(),description:document.getElementById("goal-description").value.trim()||null,category:document.getElementById("goal-category").value,status:document.getElementById("goal-status").value,deadline:document.getElementById("goal-deadline").value||null};
  if(!payload.title)return;
  const url=editingGoalId?`${API}/goals/${editingGoalId}`:`${API}/goals`,method=editingGoalId?"PUT":"POST";
  await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  closeGoalForm(); await refreshGoals(); renderGoals();
}

async function renderGoals(){
  const el=document.getElementById("goals-list"); el.innerHTML="<em class='muted'>Загрузка...</em>";
  const progList=await fetch(`${API}/goals/progress`).then(r=>r.json()).catch(()=>[]);
  const filtered=currentGoalStatus?progList.filter(p=>p.goal.status===currentGoalStatus):progList;
  el.innerHTML="";
  if(!filtered.length){el.innerHTML="<div class='card'><em class='muted'>Нет целей</em></div>";return;}
  filtered.forEach(p=>{
    const g=p.goal,pct=p.tasks_total?Math.round(p.tasks_done/p.tasks_total*100):0;
    const deadline=g.deadline?`<span class="goal-deadline ${p.days_until_deadline<7?"urgent":""}">📅 ${localDate(g.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})} (${p.days_until_deadline} дн.)</span>`:"";
    const card=document.createElement("div");card.className="card goal-card";
    card.innerHTML=`<div class="goal-card-header"><div><span class="goal-title">${g.title}</span><span class="detail-tag cat-${g.category}">${CAT_LABELS[g.category]||g.category}</span><span class="status-badge ${STATUS_CLASS[g.status]||""}">${STATUS_LABELS[g.status]||g.status}</span></div><div class="goal-actions"><button class="btn-link" data-edit="${g.id}">✏️</button><button class="btn-link danger" data-del="${g.id}">✕</button></div></div>${g.description?`<p class="goal-desc">${g.description}</p>`:""}<div class="goal-meta">${deadline}<span>⏱ ${fmtMinutes(p.total_minutes)} вложено</span><span>✅ ${p.tasks_done}/${p.tasks_total} задач</span></div>${p.tasks_total?`<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div><div style="font-size:.75rem;color:var(--muted)">${pct}%</div>`:""} ${p.linked_habits.length?`<div class="goal-habits">🔄 ${p.linked_habits.map(h=>h.title).join(", ")}</div>`:""}<button class="btn-link goal-open-btn" data-id="${g.id}">Открыть →</button>`;
    card.querySelector("[data-edit]").addEventListener("click",()=>openGoalForm(g));
    card.querySelector("[data-del]").addEventListener("click",async()=>{if(!confirm(`Удалить цель «${g.title}»?`))return;await fetch(`${API}/goals/${g.id}`,{method:"DELETE"});await refreshGoals();renderGoals();});
    card.querySelector(".goal-open-btn").addEventListener("click",()=>openGoalDetail(g.id));
    el.appendChild(card);
  });
}

async function openGoalDetail(goalId){
  document.getElementById("goals-list").style.display="none";
  document.querySelectorAll("#page-goals .page-header,#goal-status-tabs").forEach(e=>e.style.display="none");
  document.getElementById("goal-detail").style.display="block";
  const content=document.getElementById("goal-detail-content");content.innerHTML="<em class='muted'>Загрузка...</em>";
  const [prog,tasks]=await Promise.all([
    fetch(`${API}/goals/${goalId}/progress`).then(r=>r.json()),
    fetch(`${API}/goals/${goalId}/tasks`).then(r=>r.json()).catch(()=>[]),
  ]);
  const g=prog.goal;
  const tasksHtml=tasks.length?tasks.map(t=>`
    <div class="tree-node">
      <span class="status-dot ${STATUS_CLASS[t.status]||""}"></span>
      <span class="tree-title ${t.status==="done"?"line-through":""}">${t.title}</span>
      <span class="detail-tag cat-${t.category}">${CAT_LABELS[t.category]||t.category}</span>
      ${t.estimated_minutes?`<span class="task-time-badge">~${fmtMinutes(t.estimated_minutes)}</span>`:""}
      ${t.actual_minutes?`<span class="task-time-badge act">${fmtMinutes(t.actual_minutes)}</span>`:""}
      <button class="btn-link" data-id="${t.id}" data-done="${t.status==="done"}">${t.status==="done"?"↩":"✓"}</button>
    </div>`).join(""):"<em class='muted'>Нет задач</em>";
  content.innerHTML=`
    <div class="card" style="margin-top:.5rem"><div class="goal-card-header"><span class="goal-title">${g.title}</span><span class="status-badge ${STATUS_CLASS[g.status]}">${STATUS_LABELS[g.status]||g.status}</span></div>${g.description?`<p class="goal-desc">${g.description}</p>`:""}<div class="goal-meta">${g.deadline?`<span>📅 ${localDate(g.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}</span>`:""}<span>⏱ ${fmtMinutes(prog.total_minutes)} вложено</span><span>✅ ${prog.tasks_done}/${prog.tasks_total} задач</span></div></div>
    <div class="card"><h3>Задачи цели</h3><div class="task-tree">${tasksHtml}</div><button class="btn-secondary" style="margin-top:.5rem" onclick="switchPage('tasks')">+ Добавить задачу</button></div>
    <div class="card"><h3>Привычки</h3>${prog.linked_habits.length?prog.linked_habits.map(h=>`<div class="habit-row"><span class="habit-title">${h.title}</span><span class="habit-freq">${h.frequency==="daily"?"каждый день":`${h.times_per_week}× в нед.`}</span></div>`).join(""):"<em class='muted'>Нет привычек</em>"}</div>`;
  content.querySelectorAll("[data-done]").forEach(btn=>btn.addEventListener("click",async()=>{
    const isDone=btn.dataset.done==="true";
    await fetch(`${API}/tasks/${btn.dataset.id}/status?status=${isDone?"open":"done"}`,{method:"PATCH"});
    openGoalDetail(goalId);
  }));
}

// ─── TASKS (BACKLOG) PAGE ─────────────────────────────────────────────────────

let tasksInited=false;

async function initTasksPage(){
  await refreshGoals();
  if(!tasksInited){
    document.getElementById("open-add-task").onclick=()=>document.getElementById("add-task-form").style.display="block";
    document.getElementById("cancel-task-btn").onclick=()=>document.getElementById("add-task-form").style.display="none";
    document.getElementById("save-task-btn").onclick=saveTask;
    tasksInited=true;
  }
  populateGoalSelects(); renderBacklog();
}

async function renderBacklog(){
  const el=document.getElementById("tasks-list"); el.innerHTML="<em class='muted'>Загрузка...</em>";
  const tasks=await fetch(`${API}/tasks/backlog`).then(r=>r.json()).catch(()=>[]);
  if(!tasks.length){el.innerHTML="<div class='card'><em class='muted'>Беклог пуст</em></div>";return;}
  el.innerHTML="";

  // группируем: назначенные на день / без даты
  const scheduled=tasks.filter(t=>t.scheduled_date);
  const unscheduled=tasks.filter(t=>!t.scheduled_date);

  const renderGroup=(title,list)=>{
    if(!list.length)return;
    const grp=document.createElement("div");grp.className="card";
    grp.innerHTML=`<h3>${title}</h3>`;
    list.forEach(t=>{
      const card=document.createElement("div");card.className="task-card";
      card.innerHTML=`
        <div class="task-card-header">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
            <span class="task-card-title">${t.title}</span>
            <span class="detail-tag cat-${t.category}">${CAT_LABELS[t.category]||t.category}</span>
            ${t.scheduled_date?`<span class="task-time-badge">📅 ${localDate(t.scheduled_date).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>`:""}
            ${t.deadline?`<span class="task-time-badge">⏰ ${localDate(t.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span>`:""}
            ${t.estimated_minutes?`<span class="task-time-badge">~${fmtMinutes(t.estimated_minutes)}</span>`:""}
          </div>
          <div style="display:flex;gap:.4rem">
            <button class="btn-link task-done-btn" data-id="${t.id}" title="Выполнено">✓</button>
            <button class="btn-link danger task-del" data-id="${t.id}" title="Удалить">✕</button>
          </div>
        </div>
        ${t.note?`<div class="task-note-text">${t.note}</div>`:""}`;
      card.querySelector(".task-done-btn").addEventListener("click",async()=>{
        await fetch(`${API}/tasks/${t.id}/status?status=done`,{method:"PATCH"});
        renderBacklog();
      });
      card.querySelector(".task-del").addEventListener("click",async()=>{
        if(!confirm(`Удалить «${t.title}»?`))return;
        await fetch(`${API}/tasks/${t.id}`,{method:"DELETE"});
        renderBacklog();
      });
      grp.appendChild(card);
    });
    el.appendChild(grp);
  };

  renderGroup("Назначенные на день",scheduled);
  renderGroup("Без даты",unscheduled);
}

async function saveTask(){
  const goalId=document.getElementById("task-goal-id").value;
  const payload={
    title:document.getElementById("task-title").value.trim(),
    category:document.getElementById("task-category").value,
    estimated_minutes:parseInt(document.getElementById("task-estimated").value)||null,
    scheduled_date:document.getElementById("task-scheduled").value||null,
    deadline:document.getElementById("task-deadline").value||null,
    goal_id:goalId||null,
    note:document.getElementById("task-note").value.trim()||null,
    status:"open",
  };
  if(!payload.title)return;
  await fetch(`${API}/tasks`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  ["task-title","task-estimated","task-scheduled","task-deadline","task-note"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("task-goal-id").value="";
  document.getElementById("add-task-form").style.display="none";
  renderBacklog(); await refreshOpenTasks();
}

// ─── HABITS PAGE ──────────────────────────────────────────────────────────────

async function initHabitsPage(){
  await refreshGoals();
  document.getElementById("open-add-habit").onclick=()=>document.getElementById("add-habit-form").style.display="block";
  document.getElementById("cancel-habit-btn").onclick=()=>document.getElementById("add-habit-form").style.display="none";
  document.getElementById("save-habit-btn").onclick=saveHabit;
  document.getElementById("habit-frequency").addEventListener("change",e=>{document.getElementById("times-per-week-label").style.display=e.target.value==="weekly"?"block":"none";});
  populateGoalSelects();renderHabitsPage();
}

async function renderHabitsPage(){
  const el=document.getElementById("habits-page-list");el.innerHTML="<em class='muted'>Загрузка...</em>";
  const end=todayIso,start=shiftIso(todayIso,-27);
  const [habitList,stats]=await Promise.all([fetch(`${API}/habits`).then(r=>r.json()).catch(()=>[]),fetch(`${API}/analytics/stats?start=${start}&end=${end}`).then(r=>r.json()).catch(()=>({habit_stats:[]}))]);
  habits=habitList;
  if(!habitList.length){el.innerHTML="<div class='card'><em class='muted'>Нет привычек. Добавьте первую!</em></div>";return;}
  const statsMap={};(stats.habit_stats||[]).forEach(s=>{statsMap[s.habit.id]=s;});
  const dates28=[];for(let i=27;i>=0;i--)dates28.push(shiftIso(todayIso,-i));
  el.innerHTML="";
  habitList.forEach(h=>{
    const s=statsMap[h.id],done=new Set(s?.done_dates||[]),streak=s?.streak||0,rate=s?Math.round(s.completion_rate*100):0;
    const goalName=allGoals.find(g=>g.id===h.goal_id)?.title;
    const cells=dates28.map(iso=>`<div class="heat-cell ${done.has(iso)?"heat-done":"heat-empty"}" title="${localDate(iso).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}"></div>`).join("");
    const card=document.createElement("div");card.className="card habit-card";
    card.innerHTML=`<div class="habit-card-header"><div><span class="habit-card-title">${h.title}</span><span class="detail-tag cat-${h.category}">${CAT_LABELS[h.category]||h.category}</span>${goalName?`<span class="goal-ref">🎯 ${goalName}</span>`:""}</div><button class="act-remove" data-id="${h.id}" title="Удалить">✕</button></div><div class="habit-meta"><span>${h.frequency==="daily"?"Каждый день":`${h.times_per_week}× в нед.`}</span><span>🔥 Серия: <b>${streak}</b> ${h.frequency==="daily"?"дн.":"нед."}</span><span>✅ <b>${rate}%</b> за 28 дн.</span></div><div class="heat-map">${cells}</div><div class="heat-labels"><span>${localDate(dates28[0]).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span><span>${localDate(dates28[27]).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</span></div>`;
    card.querySelector("[data-id]").addEventListener("click",async()=>{if(!confirm(`Удалить «${h.title}»?`))return;await fetch(`${API}/habits/${h.id}`,{method:"DELETE"});renderHabitsPage();});
    el.appendChild(card);
  });
}

async function saveHabit(){
  const freq=document.getElementById("habit-frequency").value;
  const payload={title:document.getElementById("habit-title").value.trim(),category:document.getElementById("habit-category").value,frequency:freq,times_per_week:freq==="weekly"?parseInt(document.getElementById("habit-times").value):1,goal_id:document.getElementById("habit-goal-id").value||null,note:document.getElementById("habit-note").value.trim()||null};
  if(!payload.title)return;
  await fetch(`${API}/habits`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  ["habit-title","habit-note"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("add-habit-form").style.display="none";renderHabitsPage();
}

// ─── STATS PAGE ───────────────────────────────────────────────────────────────

let calYear,calMonth,summaryCache={},statsInited=false;

async function refreshSummaryCache(){
  const allDates=await fetch(`${API}/days`).then(r=>r.json()).catch(()=>[]);
  if(!allDates.length)return;
  const sums=await fetch(`${API}/analytics/summaries?start=${allDates[0]}&end=${todayIso}`).then(r=>r.json()).catch(()=>[]);
  summaryCache={};sums.forEach(s=>{summaryCache[s.date]=s;});
}

async function initStats(){
  if(!statsInited){
    const now=new Date();calYear=now.getFullYear();calMonth=now.getMonth();
    document.getElementById("cal-prev").addEventListener("click",()=>shiftMonth(-1));
    document.getElementById("cal-next").addEventListener("click",()=>shiftMonth(+1));
    document.querySelectorAll(".period-btn").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".period-btn").forEach(b=>b.classList.remove("active"));btn.classList.add("active");loadPeriodStats(parseInt(btn.dataset.days));}));
    statsInited=true;
  }
  await refreshSummaryCache();renderCalendar();loadPeriodStats(30);
}

function shiftMonth(delta){calMonth+=delta;if(calMonth<0){calMonth=11;calYear--;}if(calMonth>11){calMonth=0;calYear++;}renderCalendar();}

function renderCalendar(){
  if(calYear===undefined)return;
  document.getElementById("cal-title").textContent=`${RU_MONTHS[calMonth]} ${calYear}`;
  const cal=document.getElementById("calendar");cal.innerHTML="";
  const header=document.createElement("div");header.className="cal-grid";
  RU_DAYS.forEach(d=>{const c=document.createElement("div");c.className="cal-dow";c.textContent=d;header.appendChild(c);});
  cal.appendChild(header);
  const grid=document.createElement("div");grid.className="cal-grid";
  const firstDay=new Date(calYear,calMonth,1),totalDays=new Date(calYear,calMonth+1,0).getDate(),dow=(firstDay.getDay()+6)%7;
  for(let i=0;i<dow;i++){const e=document.createElement("div");e.className="cal-cell cal-empty";grid.appendChild(e);}
  for(let day=1;day<=totalDays;day++){
    const iso=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`,sum=summaryCache[iso];
    const cell=document.createElement("div");cell.className="cal-cell"+(iso===todayIso?" cal-today":"");
    cell.style.background=ratingColor(sum?.rating);cell.style.color=ratingTextColor(sum?.rating);
    cell.innerHTML=`<span class="cal-day-num">${day}</span><div class="cal-cell-bottom">${sum?.sleep_before_day?`<span class="cal-sleep">💤${fmtMinutes(sum.sleep_before_day)}</span>`:""}${sum?`<span class="cal-rating">${sum.rating}</span>`:""}</div>`;
    if(sum){cell.style.cursor="pointer";cell.addEventListener("click",()=>showDayDetail(iso));}
    grid.appendChild(cell);
  }
  cal.appendChild(grid);
}

async function showDayDetail(iso){
  const detail=document.getElementById("day-detail");detail.style.display="block";detail.innerHTML="<em>Загрузка...</em>";
  const res=await fetch(`${API}/days/${iso}`).catch(()=>null);
  if(!res||!res.ok){detail.innerHTML="Нет данных";return;}
  const day=await res.json(),dateStr=localDate(iso).toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"});
  const sleepHtml=day.sleep_before_day?`<div class="detail-sleep">💤 Сон до дня: <b>${fmtMinutes(day.sleep_before_day)}</b>${day.sleep_total!==day.sleep_before_day?` · Общий: <b>${fmtMinutes(day.sleep_total)}</b>`:""}${day.wake_time?` · Подъём: <b>${day.wake_time}</b>`:""}${day.untracked_minutes?` · В хламе: <b>${fmtMinutes(day.untracked_minutes)}</b>`:""}</div>`:"";
  detail.innerHTML=`<div class="detail-header"><strong>${dateStr}</strong><span class="detail-rating-badge" style="background:${ratingColor(day.rating)};color:${ratingTextColor(day.rating)}">${day.rating}/10</span></div>${sleepHtml}${day.note?`<p class="detail-day-note">${day.note}</p>`:""}<div class="detail-acts">${day.activities.map(a=>`<div class="detail-act"><span class="detail-act-title">${a.title}</span><span class="detail-tag cat-${a.category}">${CAT_LABELS[a.category]||a.category}</span><span class="detail-tag imp-${a.impact}">${IMPACT_LABELS[a.impact]||a.impact}</span><span class="detail-dur">${a.duration_m}м</span>${a.note?`<span class="detail-note">${a.note}</span>`:""}</div>`).join("")||"<em>Нет действий</em>"}</div><div style="text-align:right;margin-top:.5rem"><button class="btn-secondary" onclick="openLogForDate('${iso}')">✏️ Редактировать</button></div>`;
  detail.scrollIntoView({behavior:"smooth",block:"nearest"});
}

function openLogForDate(iso){switchPage("log");dateInput.value=iso;dateLabel.textContent=friendlyDate(iso);loadLogPage(iso);}

async function loadPeriodStats(days){
  const el=document.getElementById("stats-output");el.innerHTML="<em>Загрузка...</em>";
  const allDates=await fetch(`${API}/days`).then(r=>r.json()).catch(()=>[]);
  const start=days>=90&&allDates.length?allDates[0]:shiftIso(todayIso,-(days-1));
  try{const s=await fetch(`${API}/analytics/stats?start=${start}&end=${todayIso}`).then(r=>r.json());renderStats(el,s);}catch{el.textContent="Нет данных";}
}

function renderStats(el,s){
  if(!s.days_count){el.innerHTML="<em>Нет записей за период</em>";return;}
  const mC=Math.max(...Object.values(s.time_by_category),1),mI=Math.max(...Object.values(s.time_by_impact),1);
  el.innerHTML=`<div class="stat-grid"><div class="stat-box"><div class="val">${s.days_count}</div><div class="lbl">Дней записано</div></div><div class="stat-box"><div class="val">${s.avg_rating.toFixed(1)}</div><div class="lbl">Средняя оценка</div></div><div class="stat-box"><div class="val">${(s.avg_productivity*100).toFixed(0)}%</div><div class="lbl">Продуктивность</div></div>${s.avg_sleep_minutes?`<div class="stat-box"><div class="val">${fmtMinutes(Math.round(s.avg_sleep_minutes))}</div><div class="lbl">Средний сон</div></div>`:""}${s.avg_wake_time?`<div class="stat-box"><div class="val">${s.avg_wake_time}</div><div class="lbl">Средний подъём</div></div>`:""}</div><h3 style="margin-top:1rem">Время по категориям</h3>${Object.entries(s.time_by_category).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="bar-row"><span class="bar-label">${CAT_LABELS[k]||k}</span><div class="bar-track"><div class="bar-fill" style="width:${(v/mC*100).toFixed(1)}%"></div></div><span class="bar-val">${fmtMinutes(v)}</span></div>`).join("")}<h3 style="margin-top:1rem">Время по импакту</h3>${Object.entries(s.time_by_impact).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="bar-row"><span class="bar-label">${IMPACT_LABELS[k]||k}</span><div class="bar-track"><div class="bar-fill" style="width:${(v/mI*100).toFixed(1)}%;background:${IMPACT_COLORS[k]||"#999"}"></div></div><span class="bar-val">${fmtMinutes(v)}</span></div>`).join("")}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

(async()=>{
  await Promise.all([loadHabits(),refreshGoals(),refreshOpenTasks()]);
  await loadLogPage(todayIso);
})();
