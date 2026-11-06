import * as E from "./engine.js";
import * as store from "./store.js";
import * as sync from "./sync.js";
import { lineChart, barChart } from "./charts.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const S = () => store.get();
const unit = () => S().settings.unit;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtW = (w) => (w === "" || w == null ? "—" : Number(w) % 1 ? Number(w).toFixed(1) : String(Number(w)));
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? "" : Number(v));

let view = "today";
let progressLift = "squat";

// ---------- toast ----------
let toastTimer;
function toast(msg, cls = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show " + cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), cls === "pr" ? 3200 : 2000);
}

// ---------- sheets ----------
function sheet(html, mount) {
  const bd = document.createElement("div");
  bd.className = "sheet-backdrop";
  bd.innerHTML = `<div class="sheet">${html}</div>`;
  const close = () => bd.remove();
  bd.addEventListener("click", (e) => { if (e.target === bd) close(); });
  document.body.appendChild(bd);
  mount && mount($(".sheet", bd), close);
  return close;
}

// ---------- navigation ----------
function switchView(name) {
  view = name;
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $("#pageTitle").textContent = { today: "Today", progress: "Progress", history: "History" }[name];
  render();
  window.scrollTo(0, 0);
}
$$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));

function render() {
  if (!S().settings.onboarded) { onboarding(); return; }
  if (view === "today") renderToday();
  if (view === "progress") renderProgress();
  if (view === "history") renderHistory();
}

// ---------- helpers over history ----------
const finished = () => S().sessions.filter((s) => s.finishedAt).sort((a, b) => a.finishedAt - b.finishedAt);
const active = () => S().sessions.find((s) => !s.finishedAt);

function lastSetsFor(exId) {
  const list = finished();
  for (let i = list.length - 1; i >= 0; i--) {
    const ex = list[i].exercises.find((e) => e.exId === exId);
    if (ex) {
      const work = ex.sets.filter((s) => !s.warmup && s.done);
      if (work.length) return work.map((s) => ({ w: num(s.w), r: num(s.r) }));
    }
  }
  return null;
}

// Best e1RM before this set: { prev: from other sessions, now: earlier sets this session }.
function bestE1rm(exId, excludeSet, sessId) {
  let prev = 0, now = 0;
  for (const sess of S().sessions) {
    for (const ex of sess.exercises) {
      if (ex.exId !== exId) continue;
      for (const s of ex.sets) {
        if (s === excludeSet || s.warmup || !s.done) continue;
        const v = E.convert(E.e1rm(num(s.w), num(s.r)), sess.unit || unit(), unit());
        if (sess.id === sessId) now = Math.max(now, v); else prev = Math.max(prev, v);
      }
    }
  }
  return { prev, now };
}

function weekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return store.todayStr(d);
}

function ctx(week) {
  const st = S().settings;
  return { lifts: st.lifts, swaps: st.swaps, custom: st.custom, week, unit: st.unit, lastSets: lastSetsFor };
}

function prescText(ex) {
  const reps = ex.target.reps[0] === ex.target.reps[1] ? ex.target.reps[0] : `${ex.target.reps[0]}-${ex.target.reps[1]}`;
  const w = ex.eq === "bodyweight" ? "bodyweight" : ex.find ? "find weight" : `${fmtW(ex.target.w)} ${unit()}`;
  return `${ex.target.sets}×${reps} · ${w}`;
}

// ---------- TODAY ----------
function renderToday() {
  const el = $("#view-today");
  const sess = active();
  if (sess) return renderActive(el, sess);

  const st = S().settings;
  const today = store.todayStr();
  const week = E.weekNumber(st.startDate, today);
  const nextKey = E.nextDayKey(S().sessions);
  const day = E.dayByKey(nextKey);
  const isTraining = st.days.includes(new Date().getDay());
  const doneToday = finished().filter((s) => s.date === today);
  const thisWeek = finished().filter((s) => weekStart(s.date) === weekStart(today)).length;
  const exs = day.slots.map((sl) => E.buildExercise(sl, ctx(week)));
  const ramp = week <= 2 && E.MAIN_LIFTS.some((id) => st.lifts[id]?.ramp);

  let html = `<div class="eyebrow" style="margin:4px 0 10px">Week ${week} · ${thisWeek}/${st.days.length} workouts this week</div>`;
  if (ramp) html += `<div class="banner ramp"><b>Re-entry week ${week}.</b> Main lifts are at ${week === 1 ? "70" : "80"}% of your old numbers. Leave reps in the tank: the goal is showing up, not grinding.</div>`;
  if (doneToday.length) {
    const d = doneToday[doneToday.length - 1];
    html += `<div class="card"><h2>✓ ${esc(d.label)} done</h2><div class="muted small">${summaryLine(d)}</div></div>`;
  }
  html += `<div class="card">
    <div class="eyebrow">${doneToday.length ? "Next session" : isTraining ? "Today's workout" : "Rest day · next up"}</div>
    <h2 style="margin-top:4px">${day.label} <span class="muted" style="font-weight:500;font-size:15px">· ${day.focus} focus</span></h2>
    <div style="margin-top:6px">${exs.map((ex) => `
      <div class="ex-line"><div class="n">${esc(ex.name)}${ex.type === "main" ? '<span class="tag main">Main</span>' : ""}</div><div class="t">${prescText(ex)}</div></div>`).join("")}
    </div>
    <button class="btn ${isTraining && !doneToday.length ? "btn-primary" : "btn-ghost"} btn-block" id="startBtn" style="margin-top:12px">${isTraining && !doneToday.length ? "Start workout" : "Train anyway"}</button>
    <div class="muted small" style="margin:14px 0 8px">Or pick a different day:</div>
    <div class="chips">${E.PROGRAM.map((d) => `<button class="chip ${d.key === nextKey ? "active" : ""}" data-day="${d.key}">${d.label}</button>`).join("")}</div>
  </div>`;
  if (!isTraining && !doneToday.length) {
    html += `<div class="muted small" style="text-align:center">Training days: ${st.days.map((d) => DOW[d]).join(" · ")}</div>`;
  }
  el.innerHTML = html;
  $("#startBtn").addEventListener("click", () => startSession(nextKey));
  $$("[data-day]", el).forEach((b) => b.addEventListener("click", () => startSession(b.dataset.day)));
}

function summaryLine(s) {
  const sets = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done && !x.warmup).length, 0);
  const mins = s.finishedAt && s.startedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : null;
  const vol = Math.round(E.sessionVolume(s));
  const prs = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.pr).length, 0);
  return [`${s.exercises.length} exercises`, `${sets} sets`, `${vol.toLocaleString()} ${s.unit || unit()}`, mins && mins < 600 ? `${mins} min` : null, prs ? `🏆 ${prs} PR${prs > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
}

function startSession(dayKey) {
  const st = S().settings;
  const date = store.todayStr();
  const week = E.weekNumber(st.startDate, date);
  const day = E.dayByKey(dayKey);
  store.upsertSession({
    id: store.uid(), date, dayKey, label: day.label, week, unit: st.unit,
    exercises: day.slots.map((sl) => E.buildExercise(sl, ctx(week))),
    startedAt: Date.now(), finishedAt: null, applied: false,
  });
  unlockAudio();
  render();
  window.scrollTo(0, 0);
}

function renderActive(el, sess) {
  const elapsed = Math.round((Date.now() - sess.startedAt) / 60000);
  let html = `<div class="row" style="align-items:center;margin:2px 0 12px">
      <div><div class="eyebrow">Week ${sess.week || "–"} · ${elapsed} min</div><h2 style="margin:2px 0 0;font-size:22px">${esc(sess.label)}</h2></div>
      <button class="btn btn-primary btn-sm" id="finishBtn" style="flex:0 0 auto">Finish</button>
    </div>`;
  sess.exercises.forEach((ex, i) => {
    const last = lastSetsFor(ex.exId);
    const workW = num((ex.sets.find((s) => !s.warmup && !s.done) || ex.sets.find((s) => !s.warmup) || {}).w) || ex.target.w;
    const pl = ex.eq === "barbell" && workW ? E.plates(workW, sess.unit) : [];
    const typeLabel = { main: "Main lift", secondary: "Secondary", acc: "Accessory", extra: "Extra" }[ex.type];
    let workIdx = 0;
    html += `<div class="card ex-card" data-ex="${i}">
      <div class="ex-head"><div class="grow">
        <div class="ex-title">${esc(ex.name)}</div>
        <div class="ex-sub">${typeLabel}${ex.type === "extra" ? "" : " · " + prescText(ex)}</div>
      </div><button class="icon-btn" data-swap="${i}" aria-label="Exercise options">⋯</button></div>
      <div class="ex-meta">
        ${last ? `<span>Last: <b>${last.map((s) => `${fmtW(s.w)}×${s.r}`).join(", ")}</b></span>` : ""}
        ${pl.length ? `<span>Per side: <b>${pl.join(" · ")}</b></span>` : ""}
      </div>
      ${ex.find ? `<div class="hint">Find your weight: work up in sets until ${ex.target.reps[0]} reps feels like 2–3 left in the tank, then log that weight for your work sets.</div>` : ""}
      <div class="col-head"><span>Set</span><span>${ex.eq === "bodyweight" ? "+" + sess.unit : sess.unit}</span><span></span><span>Reps</span><span></span></div>
      <div class="set-grid">${ex.sets.map((s, j) => {
        const label = s.warmup ? "WU" : String(++workIdx);
        return `<div class="set-row ${s.warmup ? "warm" : ""} ${s.done ? "done" : ""}" data-set="${j}">
          <div class="sl">${label}${s.pr ? '<div class="pr-badge">PR</div>' : ""}</div>
          <input type="number" inputmode="decimal" step="any" data-f="w" value="${s.w === "" ? "" : esc(s.w)}" placeholder="${ex.eq === "bodyweight" ? "BW" : "0"}" />
          <div class="x">×</div>
          <input type="number" inputmode="numeric" data-f="r" value="${esc(s.r)}" placeholder="0" />
          <button class="check" data-check aria-label="Mark set done">✓</button>
        </div>`;
      }).join("")}</div>
      <div class="ex-actions">
        <button class="btn btn-ghost btn-sm" data-addset="${i}">+ Set</button>
        ${ex.sets.length > 1 ? `<button class="btn btn-ghost btn-sm" data-delset="${i}">− Set</button>` : ""}
      </div>
    </div>`;
  });
  html += `<button class="btn btn-ghost btn-block" id="addExBtn">+ Add exercise</button>
    <div class="row" style="margin-top:10px">
      <button class="btn btn-danger" id="discardBtn">Discard</button>
      <button class="btn btn-primary" id="finishBtn2">Finish workout</button>
    </div>`;
  el.innerHTML = html;

  const save = () => store.upsertSession(sess);
  $$(".ex-card", el).forEach((card) => {
    const ex = sess.exercises[card.dataset.ex];
    $$(".set-row", card).forEach((row) => {
      const set = ex.sets[row.dataset.set];
      $$("input", row).forEach((inp) => inp.addEventListener("change", () => {
        const v = num(inp.value);
        const f = inp.dataset.f;
        // Changing a work set's weight carries forward to the later, unfinished work sets.
        if (f === "w" && !set.warmup) {
          const idx = ex.sets.indexOf(set);
          ex.sets.forEach((s2, k) => { if (k > idx && !s2.warmup && !s2.done && s2.w === set.w) s2.w = v; });
        }
        set[f] = v;
        save();
        // Update sibling inputs in place; a full re-render would steal focus on mobile.
        if (f === "w") $$(".set-row", card).forEach((r2) => { $('[data-f="w"]', r2).value = ex.sets[r2.dataset.set].w; });
      }));
      $("[data-check]", row).addEventListener("click", () => {
        unlockAudio();
        set.w = num($('[data-f="w"]', row).value);
        set.r = num($('[data-f="r"]', row).value);
        if (!set.done && !set.r) { toast("Enter reps first"); return; }
        set.done = !set.done;
        set.pr = false;
        if (set.done) {
          if (!set.warmup && ex.eq !== "bodyweight") checkPR(sess, ex, set);
          const rest = S().settings.rest;
          startTimer(set.warmup ? 60 : rest[ex.type] || 90, ex.name);
        }
        save();
        renderToday();
      });
    });
  });
  $$("[data-addset]", el).forEach((b) => b.addEventListener("click", () => {
    const ex = sess.exercises[b.dataset.addset];
    const prev = [...ex.sets].reverse().find((s) => !s.warmup) || { w: "", r: ex.target.reps[0] || 8 };
    ex.sets.push({ w: prev.w, r: prev.r, done: false, warmup: false });
    save(); renderToday();
  }));
  $$("[data-delset]", el).forEach((b) => b.addEventListener("click", () => {
    const ex = sess.exercises[b.dataset.delset];
    const k = ex.sets.map((s) => !s.done).lastIndexOf(true);
    ex.sets.splice(k >= 0 ? k : ex.sets.length - 1, 1);
    save(); renderToday();
  }));
  $$("[data-swap]", el).forEach((b) => b.addEventListener("click", () => exerciseOptions(sess, Number(b.dataset.swap))));
  $("#addExBtn").addEventListener("click", () => pickExercise("Add exercise", null, (exId, name) => {
    const st = S().settings;
    const info = E.exInfo(exId, st.custom);
    const w = st.lifts[exId]?.weight ?? "";
    sess.exercises.push({ slot: null, exId, name: name || info.name, eq: info.eq, cat: info.cat, type: "extra", target: { sets: 3, reps: [8, 12], w }, find: false,
      sets: [0, 1, 2].map(() => ({ w, r: 10, done: false, warmup: false })) });
    save(); renderToday();
  }));
  $("#finishBtn").addEventListener("click", () => finishSession(sess));
  $("#finishBtn2").addEventListener("click", () => finishSession(sess));
  $("#discardBtn").addEventListener("click", () => {
    if (!confirm("Discard this workout? Logged sets will be lost.")) return;
    store.deleteSession(sess.id);
    stopTimer();
    render();
  });
}

function checkPR(sess, ex, set) {
  const { prev, now } = bestE1rm(ex.exId, set, sess.id);
  const mine = E.e1rm(num(set.w), num(set.r));
  // No PRs on the first time doing an exercise; there's nothing to beat yet.
  if (prev > 0 && mine > Math.max(prev, now) + 0.01) {
    set.pr = true;
    toast(`🏆 New PR: ${ex.name}, est. 1RM ${Math.round(mine)} ${unit()}`, "pr");
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  }
}

function exerciseOptions(sess, i) {
  const ex = sess.exercises[i];
  sheet(`<h2>${esc(ex.name)}</h2>
    <div class="stack">
      <button class="btn btn-ghost btn-block" data-a="swap">Swap exercise${ex.slot ? " (keeps it in your plan)" : ""}</button>
      <button class="btn btn-ghost btn-block" data-a="skip">Remove from today</button>
      <button class="btn btn-ghost btn-block" data-a="close">Cancel</button>
    </div>`, (el, close) => {
    $('[data-a="close"]', el).onclick = close;
    $('[data-a="skip"]', el).onclick = () => { sess.exercises.splice(i, 1); store.upsertSession(sess); close(); renderToday(); };
    $('[data-a="swap"]', el).onclick = () => {
      close();
      pickExercise("Swap " + ex.name, ex.cat, (exId) => {
        if (ex.slot) {
          store.updateSettings((s) => { s.swaps[ex.slot] = exId; });
          const day = E.dayByKey(sess.dayKey);
          const slot = day && day.slots.find((s) => s.slot === ex.slot);
          if (slot) { sess.exercises[i] = E.buildExercise(slot, ctx(sess.week)); store.upsertSession(sess); renderToday(); return; }
        }
        const info = E.exInfo(exId, S().settings.custom);
        Object.assign(ex, { exId, name: info.name, eq: info.eq, cat: info.cat });
        store.upsertSession(sess); renderToday();
      });
    };
  });
}

function pickExercise(title, cat, onPick) {
  const st = S().settings;
  const all = { ...E.LIBRARY, ...st.custom };
  const ids = Object.keys(all).sort((a, b) => ((all[b].cat === cat) - (all[a].cat === cat)) || all[a].name.localeCompare(all[b].name));
  sheet(`<h2>${esc(title)}</h2>
    <div class="field"><input id="exSearch" placeholder="Search or type a new exercise" autocomplete="off" /></div>
    <div id="exList"></div>`, (el, close) => {
    const list = $("#exList", el), input = $("#exSearch", el);
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const hits = ids.filter((id) => all[id].name.toLowerCase().includes(q));
      list.innerHTML = hits.map((id) => `<button class="pick-row" data-id="${id}"><span>${esc(all[id].name)}</span><span class="muted">${all[id].eq}</span></button>`).join("") +
        (q && !hits.some((id) => all[id].name.toLowerCase() === q) ? `<div style="margin-top:12px">
          <div class="muted small" style="margin-bottom:6px">Create “${esc(input.value.trim())}” as:</div>
          <div class="chips">${["barbell", "dumbbell", "machine", "bodyweight"].map((eq) => `<button class="chip" data-new="${eq}">${eq}</button>`).join("")}</div></div>` : "");
      $$("[data-id]", list).forEach((b) => b.onclick = () => { close(); onPick(b.dataset.id); });
      $$("[data-new]", list).forEach((b) => b.onclick = () => {
        const name = input.value.trim();
        const id = "custom:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        store.updateSettings((s) => { s.custom[id] = { name, eq: b.dataset.new, cat: cat || "other" }; });
        close(); onPick(id, name);
      });
    };
    input.addEventListener("input", draw);
    draw();
  });
}

function finishSession(sess) {
  const doneSets = sess.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done && !s.warmup).length, 0);
  if (!doneSets) {
    if (confirm("No sets checked off. Discard this workout?")) { store.deleteSession(sess.id); stopTimer(); render(); }
    return;
  }
  sess.finishedAt = Date.now();
  let changes = [];
  if (!sess.applied) {
    const res = E.applyProgression(sess, S().settings.lifts, sess.unit);
    changes = res.changes;
    sess.applied = true;
    store.updateSettings((s) => { s.lifts = res.lifts; });
  }
  store.upsertSession(sess);
  stopTimer();
  render();
  const prs = sess.exercises.flatMap((e) => e.sets.filter((s) => s.pr).map((s) => `${e.name} ${fmtW(s.w)}×${s.r}`));
  sheet(`<h2>Workout complete 💪</h2>
    <div class="muted small" style="margin-bottom:12px">${summaryLine(sess)}</div>
    ${prs.length ? `<div class="banner ramp"><b>🏆 PRs:</b> ${prs.map(esc).join(", ")}</div>` : ""}
    ${changes.length ? `<h3 class="eyebrow" style="margin:6px 0 4px">Next time</h3>${changes.map((c) => `
      <div class="ex-line"><div><div class="n">${esc(c.name)}</div><div class="muted small">${esc(c.note)}</div></div>
      <div class="t">${c.to == null ? "" : c.from == null || c.from === c.to ? `${fmtW(c.to)} ${sess.unit}` : `${fmtW(c.from)} → <b style="color:var(--accent)">${fmtW(c.to)}</b> ${sess.unit}`}</div></div>`).join("")}` : ""}
    <button class="btn btn-primary btn-block" id="doneOk" style="margin-top:14px">Done</button>`, (el, close) => { $("#doneOk", el).onclick = close; });
}

// ---------- rest timer ----------
let timer = null; // { end, total, label }
let tick = null;
let audioCtx = null;

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
function beep() {
  if (!audioCtx) return;
  [0, 0.25, 0.5].forEach((t) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    const s = audioCtx.currentTime + t;
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
    o.start(s); o.stop(s + 0.2);
  });
}
function startTimer(secs, label) {
  timer = { end: Date.now() + secs * 1000, total: secs, label };
  localStorage.setItem("wt.timer", JSON.stringify(timer));
  $("#timer").classList.add("show");
  $("#timer").classList.remove("done");
  clearInterval(tick);
  tick = setInterval(drawTimer, 250);
  drawTimer();
}
function stopTimer() {
  timer = null;
  localStorage.removeItem("wt.timer");
  clearInterval(tick);
  $("#timer").classList.remove("show", "done");
}
function drawTimer() {
  if (!timer) return;
  const left = Math.ceil((timer.end - Date.now()) / 1000);
  if (left <= 0) {
    if (!$("#timer").classList.contains("done")) {
      $("#timer").classList.add("done");
      $("#timerTime").textContent = "Go!";
      $("#timerLabel").textContent = "Rest over — next set";
      $("#timerBar").style.width = "100%";
      beep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setTimeout(() => { if (timer && Date.now() >= timer.end) stopTimer(); }, 5000);
    }
    return;
  }
  $("#timerTime").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  $("#timerLabel").textContent = "Rest · " + timer.label;
  $("#timerBar").style.width = `${100 * (1 - left / timer.total)}%`;
}
$("#timerPlus").onclick = () => { if (timer) { timer.end += 15000; timer.total += 15; $("#timer").classList.remove("done"); drawTimer(); } };
$("#timerMinus").onclick = () => { if (timer) { timer.end -= 15000; drawTimer(); } };
$("#timerSkip").onclick = stopTimer;
try {
  const t = JSON.parse(localStorage.getItem("wt.timer"));
  if (t && t.end > Date.now()) { timer = t; $("#timer").classList.add("show"); tick = setInterval(drawTimer, 250); }
} catch {}

// ---------- PROGRESS ----------
function renderProgress() {
  const el = $("#view-progress");
  const st = S().settings;
  const u = st.unit;
  const sessions = finished();
  const today = store.todayStr();
  const target = st.days.length;

  // weekly counts for the last 12 weeks (Monday starts)
  const thisMon = weekStart(today);
  const weeks = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(thisMon + "T00:00:00"); d.setDate(d.getDate() - 7 * k);
    weeks.push(store.todayStr(d));
  }
  const byWeek = {};
  const days = new Set(sessions.map((s) => s.date));
  for (const s of sessions) byWeek[weekStart(s.date)] = (byWeek[weekStart(s.date)] || 0) + 1;

  let streak = 0;
  {
    const d = new Date(thisMon + "T00:00:00");
    if ((byWeek[thisMon] || 0) >= target) streak++;
    for (;;) {
      d.setDate(d.getDate() - 7);
      if ((byWeek[store.todayStr(d)] || 0) >= target) streak++; else break;
    }
  }

  const exIds = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exId)))];
  const names = {};
  sessions.forEach((s) => s.exercises.forEach((e) => (names[e.exId] = e.name)));
  E.MAIN_LIFTS.forEach((id) => (names[id] = names[id] || E.LIBRARY[id].name));
  const others = exIds.filter((id) => !E.MAIN_LIFTS.includes(id)).sort((a, b) => names[a].localeCompare(names[b]));

  el.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="v">${byWeek[thisMon] || 0}<span class="muted" style="font-size:15px">/${target}</span></div><div class="k">This week</div></div>
      <div class="tile"><div class="v">${streak}</div><div class="k">Week streak</div></div>
      <div class="tile"><div class="v">${sessions.length}</div><div class="k">Workouts</div></div>
    </div>
    <div class="card"><h3>Consistency · last 12 weeks</h3>
      <div class="cal">
        ${["M", "T", "W", "T", "F", "S", "S"].map((lbl, r) => `<div class="rl">${r % 2 === 0 ? lbl : ""}</div>` + weeks.map((w) => {
          const d = new Date(w + "T00:00:00"); d.setDate(d.getDate() + r);
          const ds = store.todayStr(d);
          return `<div class="d ${days.has(ds) ? "on" : ""} ${ds > today ? "future" : ""}" title="${ds}"></div>`;
        }).join("")).join("")}
        <div class="rl"></div>${weeks.map((w) => `<div class="${(byWeek[w] || 0) >= target ? "wk-ok" : "wk-no"}"></div>`).join("")}
      </div>
      <div class="muted small" style="margin-top:8px">Bar under a week = hit your ${target}-day target.</div>
    </div>
    <div class="card"><h3>Estimated 1RM</h3>
      <div class="chips" style="margin-bottom:8px">${E.MAIN_LIFTS.map((id) => `<button class="chip ${progressLift === id ? "active" : ""}" data-lift="${id}">${E.LIBRARY[id].name.replace("Back ", "").replace(" Press", "").replace("Overhead", "OHP")}</button>`).join("")}</div>
      ${others.length ? `<select id="otherLift" style="margin-bottom:10px"><option value="">Other exercise…</option>${others.map((id) => `<option value="${esc(id)}" ${progressLift === id ? "selected" : ""}>${esc(names[id])}</option>`).join("")}</select>` : ""}
      <div class="muted small" id="liftHead" style="margin-bottom:4px"></div>
      <div id="liftChart"></div>
    </div>
    <div class="card"><h3>Weekly volume (${u})</h3><div id="volChart"></div></div>
    <div class="card"><h3>Bodyweight</h3>
      <div class="row" style="margin-bottom:10px"><input id="bwIn" type="number" inputmode="decimal" placeholder="Today's weight (${u})" /><button class="btn btn-ghost" id="bwBtn" style="flex:0 0 auto">Log</button></div>
      <div id="bwChart"></div>
    </div>
    <div class="card"><h3>Personal records</h3><div id="prList"></div></div>`;

  // e1RM chart
  const drawLift = () => {
    const pts = [];
    for (const s of sessions) {
      let best = 0, bestSet = null;
      for (const ex of s.exercises) if (ex.exId === progressLift) for (const set of ex.sets) {
        if (set.warmup || !set.done) continue;
        const v = E.convert(E.e1rm(num(set.w), num(set.r)), s.unit || u, u);
        if (v > best) { best = v; bestSet = set; }
      }
      if (best) pts.push({ x: s.date, y: Math.round(best), label: `${fmtW(bestSet.w)}×${bestSet.r}` });
    }
    const lift = st.lifts[progressLift];
    $("#liftHead", el).innerHTML = `<b style="color:var(--text)">${esc(names[progressLift] || progressLift)}</b>${lift && lift.weight ? ` · next working weight ${fmtW(lift.weight)} ${u}` : ""}`;
    lineChart($("#liftChart", el), pts, { unit: u });
  };
  drawLift();
  $$("[data-lift]", el).forEach((b) => b.onclick = () => { progressLift = b.dataset.lift; renderProgress(); });
  const other = $("#otherLift", el);
  if (other) other.onchange = () => { if (other.value) { progressLift = other.value; renderProgress(); } };

  // volume
  const vol = weeks.map((w) => {
    const v = sessions.filter((s) => weekStart(s.date) === w).reduce((a, s) => a + E.convert(E.sessionVolume(s), s.unit || u, u), 0);
    const d = new Date(w + "T00:00:00");
    return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), y: Math.round(v), tip: `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${byWeek[w] || 0} workouts` };
  });
  barChart($("#volChart", el), vol, { unit: u });

  // bodyweight
  const bw = [...S().bodyweight].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ x: b.date, y: Number(b.value) }));
  lineChart($("#bwChart", el), bw, { unit: u });
  $("#bwBtn", el).onclick = () => {
    const v = num($("#bwIn", el).value);
    if (!v) return toast("Enter a weight");
    store.addBodyweight(v);
    toast("Bodyweight logged");
    renderProgress();
  };

  // PRs
  const prs = {};
  for (const s of sessions) for (const ex of s.exercises) for (const set of ex.sets) {
    if (set.warmup || !set.done || !num(set.w)) continue;
    const v = E.convert(E.e1rm(num(set.w), num(set.r)), s.unit || u, u);
    if (!prs[ex.exId] || v > prs[ex.exId].v) prs[ex.exId] = { v, set, date: s.date, name: ex.name, unit: s.unit || u };
  }
  const rank = (id) => (E.MAIN_LIFTS.includes(id) ? E.MAIN_LIFTS.indexOf(id) : 99);
  const prRows = Object.entries(prs).sort(([a, pa], [b, pb]) => rank(a) - rank(b) || pb.v - pa.v).map(([, p]) => p);
  $("#prList", el).innerHTML = prRows.length
    ? `<table class="pr-table">${prRows.map((p) => `<tr><td><div>${esc(p.name)}</div><div class="sub">${new Date(p.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div></td>
        <td class="r"><div><b>${fmtW(p.set.w)} × ${p.set.r}</b> ${p.unit}</div><div class="sub">est. 1RM ${Math.round(p.v)} ${u}</div></td></tr>`).join("")}</table>`
    : `<div class="empty small">Finish a workout to start setting PRs.</div>`;
}

// ---------- HISTORY ----------
function renderHistory() {
  const el = $("#view-history");
  const list = finished().reverse();
  if (!list.length) { el.innerHTML = `<div class="empty">No workouts yet.<br>Your finished sessions will show up here.</div>`; return; }
  el.innerHTML = list.map((s) => `
    <button class="card hist-card" data-id="${esc(s.id)}">
      <div class="top"><span class="ttl">${esc(s.label)}</span><span class="muted small">${new Date(s.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span></div>
      <div class="muted small" style="margin-top:4px">${summaryLine(s)}</div>
      <div class="small" style="margin-top:6px;color:var(--text-dim)">${s.exercises.map((e) => esc(e.name)).join(" · ")}</div>
    </button>`).join("");
  $$("[data-id]", el).forEach((b) => b.onclick = () => historyDetail(S().sessions.find((s) => s.id === b.dataset.id)));
}

function historyDetail(sess) {
  const copy = structuredClone(sess);
  sheet(`<h2>${esc(sess.label)} <span class="muted small" style="font-weight:500">${sess.date}</span></h2>
    ${sess.notes ? `<div class="muted small" style="margin-bottom:10px">${esc(sess.notes)}</div>` : ""}
    ${copy.exercises.map((ex, i) => `<div style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:4px">${esc(ex.name)}</div>
      ${ex.sets.map((s, j) => !s.done ? "" : `<div class="set-row ${s.warmup ? "warm" : ""}" style="grid-template-columns:34px 1fr 18px 1fr 0"><div class="sl">${s.warmup ? "WU" : "•"}${s.pr ? '<div class="pr-badge">PR</div>' : ""}</div>
        <input type="number" inputmode="decimal" step="any" data-e="${i}" data-s="${j}" data-f="w" value="${esc(s.w)}" /><div class="x">×</div>
        <input type="number" inputmode="numeric" data-e="${i}" data-s="${j}" data-f="r" value="${esc(s.r)}" /><div></div></div>`).join("")}</div>`).join("")}
    <div class="row" style="margin-top:8px"><button class="btn btn-danger" id="hDel">Delete</button><button class="btn btn-primary" id="hSave">Save</button></div>`,
  (el, close) => {
    $$("input", el).forEach((inp) => inp.onchange = () => { copy.exercises[inp.dataset.e].sets[inp.dataset.s][inp.dataset.f] = num(inp.value); });
    $("#hSave", el).onclick = () => { store.upsertSession(copy); close(); toast("Saved"); render(); };
    $("#hDel", el).onclick = () => { if (confirm("Delete this workout?")) { store.deleteSession(sess.id); close(); render(); } };
  });
}

// ---------- SETTINGS ----------
function openSettings() {
  sheet(`<h2>Settings</h2><div id="setBody"></div>`, (el, close) => {
    const draw = () => {
      const st = S().settings;
      const ss = sync.getStatus();
      const planIds = [...new Set(E.PROGRAM.flatMap((d) => d.slots.map((sl) => st.swaps[sl.slot] || sl.ex)))];
      let syncHtml;
      if (!sync.configured()) {
        syncHtml = `<div class="muted small">Sync isn't set up yet. Add your Supabase URL and anon key to <code>config.js</code> (see README).</div>`;
      } else if (ss.email) {
        syncHtml = `<div class="small" style="margin-bottom:8px">Signed in as <b>${esc(ss.email)}</b> · <span class="muted">${{ idle: "synced", syncing: "syncing…", pending: "changes pending", offline: "offline, will sync later", error: "error" }[ss.status] || ss.status}</span></div>
          ${ss.lastError ? `<div class="small" style="color:var(--danger);margin-bottom:8px">${esc(ss.lastError)}</div>` : ""}
          <div class="row"><button class="btn btn-ghost" id="syncNow">Sync now</button><button class="btn btn-ghost" id="signOut">Sign out</button></div>`;
      } else {
        syncHtml = authForm();
      }
      $("#setBody", el).innerHTML = `
        <h3 class="eyebrow" style="margin:0 0 8px">Sync</h3>${syncHtml}
        <div class="section"><label class="lbl">Training days</label><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip ${st.days.includes(d) ? "active" : ""}" data-dow="${d}">${DOW[d]}</button>`).join("")}</div></div>
        <div class="section"><label class="lbl">Rest timer (seconds)</label><div class="row">
          <div><div class="muted small">Main</div><input type="number" inputmode="numeric" data-rest="main" value="${st.rest.main}"/></div>
          <div><div class="muted small">Secondary</div><input type="number" inputmode="numeric" data-rest="secondary" value="${st.rest.secondary}"/></div>
          <div><div class="muted small">Accessory</div><input type="number" inputmode="numeric" data-rest="acc" value="${st.rest.acc}"/></div></div></div>
        <div class="section"><label class="lbl">Working weights (${st.unit})</label>
          ${planIds.map((id) => { const info = E.exInfo(id, st.custom); if (info.eq === "bodyweight") return ""; const l = st.lifts[id];
            return `<div class="row" style="align-items:center;margin-bottom:6px"><div class="small" style="flex:2">${esc(info.name)}${l?.ramp && E.weekNumber(st.startDate, store.todayStr()) <= 2 ? ' <span class="tag">ramp</span>' : ""}</div><input type="number" inputmode="decimal" step="any" data-lift="${esc(id)}" value="${l?.weight ?? ""}" placeholder="find" style="padding:9px"/></div>`; }).join("")}
          <div class="muted small">Blank = find your weight next session.</div></div>
        <div class="section stack">
          <button class="btn btn-ghost btn-block" id="restart">Restart plan (keeps history)</button>
          <div class="row"><button class="btn btn-ghost" id="exportBtn">Export backup</button><button class="btn btn-ghost" id="importBtn">Import backup</button></div>
          <input type="file" id="importFile" accept="application/json" style="display:none" />
          <button class="btn btn-danger btn-block" id="clearBtn">Clear all data on this device</button>
          <button class="btn btn-ghost btn-block" id="closeSet">Close</button>
        </div>`;
      wireAuthForm(el, draw);
      const on = (sel, fn) => { const n = $(sel, el); if (n) n.onclick = fn; };
      on("#syncNow", () => sync.sync().then(draw));
      on("#signOut", () => { sync.signOut(); draw(); });
      $$("[data-dow]", el).forEach((b) => b.onclick = () => {
        const d = Number(b.dataset.dow);
        store.updateSettings((s) => { s.days = s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort(); if (!s.days.length) s.days = [d]; });
        draw(); render();
      });
      $$("[data-rest]", el).forEach((i) => i.onchange = () => store.updateSettings((s) => { s.rest[i.dataset.rest] = num(i.value) || 90; s.rest.extra = s.rest.acc; }));
      $$("input[data-lift]", el).forEach((i) => i.onchange = () => {
        store.updateSettings((s) => { const l = (s.lifts[i.dataset.lift] ||= { fails: 0 }); l.weight = i.value === "" ? null : num(i.value); l.ramp = false; l.fails = 0; });
        render();
      });
      on("#restart", () => { if (confirm("Restart the plan? You'll re-enter your lifts; history stays.")) { store.updateSettings((s) => { s.onboarded = false; }); close(); render(); } });
      on("#exportBtn", exportData);
      on("#importBtn", () => $("#importFile", el).click());
      $("#importFile", el).onchange = (e) => importData(e.target.files[0], () => { close(); render(); });
      on("#clearBtn", () => {
        if (confirm("Delete all workouts and settings on this device? Synced data in the cloud is not deleted.")) {
          sync.signOut(); store.clearAll(); close(); render();
        }
      });
      on("#closeSet", close);
    };
    draw();
  });
}

function authForm() {
  return `<div class="field"><input id="authEmail" type="email" autocomplete="email" placeholder="Email" /></div>
    <div class="field"><input id="authPass" type="password" autocomplete="current-password" placeholder="Password (6+ characters)" /></div>
    <div class="row"><button class="btn btn-primary" id="authIn">Sign in</button><button class="btn btn-ghost" id="authUp">Create account</button></div>
    <div class="muted small" id="authMsg" style="margin-top:8px">Sign in on each device to keep workouts in sync.</div>`;
}

function wireAuthForm(el, after) {
  const inBtn = $("#authIn", el), upBtn = $("#authUp", el);
  if (!inBtn) return;
  const go = async (fn, label) => {
    const email = $("#authEmail", el).value.trim(), pass = $("#authPass", el).value;
    const msg = $("#authMsg", el);
    if (!email || pass.length < 6) { msg.textContent = "Enter an email and a password of at least 6 characters."; return; }
    msg.textContent = label + "…";
    try {
      const r = await fn(email, pass);
      if (r && r.confirm) { msg.textContent = "Check your email to confirm your account, then sign in here."; return; }
      toast("Signed in — syncing");
      after && after();
      render();
    } catch (e) { msg.textContent = e.message; msg.style.color = "var(--danger)"; }
  };
  inBtn.onclick = () => go(sync.signIn, "Signing in");
  upBtn.onclick = () => go(sync.signUp, "Creating account");
}

function exportData() {
  const blob = new Blob([JSON.stringify({ app: "lift-log", version: 2, exportedAt: new Date().toISOString(), ...S() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lift-log-${store.todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file, done) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (Array.isArray(data)) {
        const sessions = store.migrateV1(data);
        if (!confirm(`Import ${sessions.length} workouts from the old app?`)) return;
        const st = S();
        store.replaceAll({ ...st, sessions: [...st.sessions.filter((s) => !sessions.some((n) => n.id === s.id)), ...sessions] });
      } else if (data && data.settings && data.sessions) {
        if (!confirm(`Replace data on this device with this backup (${data.sessions.length} workouts)?`)) return;
        store.replaceAll({ settings: data.settings, sessions: data.sessions, bodyweight: data.bodyweight || [] });
      } else throw new Error("Unrecognized file");
      toast("Imported");
      done();
    } catch (e) { toast("Import failed: " + e.message); }
  };
  r.readAsText(file);
}

$("#settingsBtn").onclick = openSettings;
$("#syncPill").onclick = openSettings;

function drawSyncPill(status) {
  const pill = $("#syncPill");
  const signedIn = Boolean(sync.getStatus().email);
  pill.classList.toggle("show", sync.configured());
  pill.dataset.s = signedIn ? status : "off";
  $("#syncText").textContent = !signedIn ? "Sign in to sync" : { idle: "Synced", syncing: "Syncing", pending: "Syncing", offline: "Offline", error: "Sync error", off: "Sign in to sync" }[status] || status;
}
sync.onStatus(drawSyncPill);

// ---------- ONBOARDING ----------
function onboarding() {
  if ($(".onboard")) return;
  const st = S().settings;
  const prevLifts = st.lifts || {};
  const data = {
    unit: "lb",
    days: st.days?.length ? [...st.days] : [1, 2, 4, 5],
    bodyweight: "",
    tops: Object.fromEntries(E.MAIN_LIFTS.map((id) => [id, prevLifts[id]?.weight ? { w: prevLifts[id].weight, r: 5 } : { w: "", r: 5 }])),
    unsure: {},
  };
  const steps = sync.configured() && !sync.getStatus().email ? ["welcome", "basics", "days", "lifts", "review"] : ["basics", "days", "lifts", "review"];
  let i = 0;
  const ov = document.createElement("div");
  ov.className = "onboard";
  document.body.appendChild(ov);

  const draw = () => {
    const step = steps[i];
    let body = "";
    if (step === "welcome") {
      body = `<h1>Welcome back to the gym.</h1><p class="lead">This builds you a 4-day strength plan that eases you back in, then logs every set and tracks your progress.</p>
        <button class="btn btn-primary btn-block" data-next>Set up a new plan</button>
        <div class="card" style="margin-top:18px"><h3>Already set up on another device?</h3>${authForm()}</div>`;
    } else if (step === "basics") {
      body = `<h1>The basics</h1><p class="lead">You can change any of this later in Settings.</p>
        <label class="lbl">Bodyweight (optional)</label><input id="obBw" type="number" inputmode="decimal" placeholder="${data.unit}" value="${data.bodyweight}" />`;
    } else if (step === "days") {
      body = `<h1>When will you train?</h1><p class="lead">Pick 4 days. Spreading them out (like Mon, Tue, Thu, Fri) helps recovery. Miss a day and the plan just picks up where you left off.</p>
        <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip ${data.days.includes(d) ? "active" : ""}" data-dow="${d}">${DOW[d]}</button>`).join("")}</div>
        <div class="muted small" style="margin-top:12px">${data.days.length} day${data.days.length === 1 ? "" : "s"} selected${data.days.length !== 4 ? " · the plan is built for 4" : ""}</div>`;
    } else if (step === "lifts") {
      body = `<h1>Your old numbers</h1><p class="lead">Enter a recent or old top set for each lift, e.g. 225 × 5. You'll start well below it. Not sure? Tick the box and your first session will help you find a starting weight.</p>
        ${E.MAIN_LIFTS.map((id) => `<div class="lift-in"><div style="font-weight:600;padding-bottom:12px">${E.LIBRARY[id].name}</div>
          <div><label class="lbl">${data.unit}</label><input type="number" inputmode="decimal" step="any" data-lw="${id}" value="${data.tops[id].w}" ${data.unsure[id] ? "disabled" : ""}/></div>
          <div><label class="lbl">Reps</label><input type="number" inputmode="numeric" data-lr="${id}" value="${data.tops[id].r}" ${data.unsure[id] ? "disabled" : ""}/></div></div>
          <label class="notsure"><input type="checkbox" data-unsure="${id}" ${data.unsure[id] ? "checked" : ""}/> Not sure</label>`).join("")}`;
    } else if (step === "review") {
      const rows = E.MAIN_LIFTS.map((id) => {
        const t = data.tops[id];
        const old = !data.unsure[id] && t.w ? E.workingFromTopSet(num(t.w), num(t.r) || 5, data.unit) : null;
        const r = (p) => fmtW(E.roundTo(old * p, "barbell", data.unit));
        return `<div class="ex-line"><div class="n">${E.LIBRARY[id].name}</div><div class="t">${old ? `${r(0.7)} → ${r(0.8)} → ${r(0.9)} ${data.unit}` : "find your weight"}</div></div>`;
      }).join("");
      body = `<h1>Your plan</h1><p class="lead">4-day Upper/Lower split for strength. Main lifts are 3×5 and go up each time you hit all your reps. Accessories go up once you reach the top of the rep range.</p>
        <div class="card"><h3>Main lifts · week 1 → 2 → 3</h3>${rows}</div>
        <div class="card"><h3>Rotation</h3>${E.PROGRAM.map((d) => `<div class="ex-line"><div class="n">${d.label}</div><div class="t">${d.slots.map((s) => E.LIBRARY[s.ex].name).slice(0, 2).join(", ")} +${d.slots.length - 2}</div></div>`).join("")}</div>
        <div class="banner info">Miss twice at the same weight and it drops 10% so you can build back up. Weeks 1–2 are deliberately light so you don't get wrecked coming back.</div>`;
    }
    const isLast = i === steps.length - 1;
    ov.innerHTML = `<div class="wrap">
      <div class="steps">${steps.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>
      ${body}
      ${step === "welcome" ? "" : `<div class="row" style="margin-top:22px">${i > 0 ? `<button class="btn btn-ghost" data-back style="flex:0 0 96px">Back</button>` : ""}<button class="btn btn-primary" data-next>${isLast ? "Start training" : "Continue"}</button></div>`}
    </div>`;

    const capture = () => {
      const bw = $("#obBw", ov); if (bw) data.bodyweight = bw.value;
      $$("[data-lw]", ov).forEach((x) => (data.tops[x.dataset.lw].w = x.value));
      $$("[data-lr]", ov).forEach((x) => (data.tops[x.dataset.lr].r = x.value));
    };
    $$("[data-dow]", ov).forEach((b) => b.onclick = () => {
      const d = Number(b.dataset.dow);
      data.days = data.days.includes(d) ? data.days.filter((x) => x !== d) : [...data.days, d];
      draw();
    });
    $$("[data-unsure]", ov).forEach((c) => c.onchange = () => { capture(); data.unsure[c.dataset.unsure] = c.checked; draw(); });
    const back = $("[data-back]", ov); if (back) back.onclick = () => { capture(); i--; draw(); };
    $("[data-next]", ov).onclick = () => {
      capture();
      if (step === "days" && !data.days.length) return toast("Pick at least one day");
      if (!isLast) { i++; draw(); window.scrollTo(0, 0); ov.scrollTo(0, 0); return; }
      const tops = {};
      for (const id of E.MAIN_LIFTS) {
        const t = data.tops[id];
        if (!data.unsure[id] && num(t.w)) tops[id] = { w: num(t.w), r: num(t.r) || 5 };
      }
      store.completeOnboarding({ unit: data.unit, days: data.days.sort(), bodyweight: num(data.bodyweight), tops });
      ov.remove();
      switchView("today");
    };
    wireAuthForm(ov, () => { if (S().settings.onboarded) { ov.remove(); render(); } else { i++; draw(); } });
  };
  draw();
}

// ---------- boot ----------
store.onChange(() => sync.schedule());
// Changes pulled from another device: redraw unless the user is mid-edit.
sync.onRemote(() => {
  const ob = $(".onboard");
  if (ob && S().settings.onboarded) ob.remove();
  if (!document.querySelector(".sheet-backdrop") && !document.activeElement?.matches("input")) render();
});
drawSyncPill(sync.getStatus().status);
render();
sync.start();
setInterval(() => { if (view === "today" && active() && !document.activeElement?.matches("input")) {
  const eb = $("#view-today .eyebrow"); if (eb) eb.textContent = `Week ${active().week || "–"} · ${Math.round((Date.now() - active().startedAt) / 60000)} min`;
} }, 30000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
