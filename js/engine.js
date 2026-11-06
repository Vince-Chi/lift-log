// Program engine: templates, prescriptions, progression, warm-ups, plate math.
// Pure functions only — no DOM, no storage.

export const LIBRARY = {
  squat:      { name: "Back Squat",            eq: "barbell",  cat: "squat" },
  bench:      { name: "Bench Press",           eq: "barbell",  cat: "press" },
  deadlift:   { name: "Deadlift",              eq: "barbell",  cat: "hinge" },
  ohp:        { name: "Overhead Press",        eq: "barbell",  cat: "press" },
  row:        { name: "Barbell Row",           eq: "barbell",  cat: "pull" },
  rdl:        { name: "Romanian Deadlift",     eq: "barbell",  cat: "hinge" },
  incline:    { name: "Incline Bench Press",   eq: "barbell",  cat: "press" },
  frontsquat: { name: "Front Squat",           eq: "barbell",  cat: "squat" },
  dbpress:    { name: "Seated DB Shoulder Press", eq: "dumbbell", cat: "press" },
  dbbench:    { name: "Dumbbell Bench Press",  eq: "dumbbell", cat: "press" },
  pulldown:   { name: "Lat Pulldown",          eq: "machine",  cat: "pull" },
  cablerow:   { name: "Seated Cable Row",      eq: "machine",  cat: "pull" },
  dbrow:      { name: "One-Arm DB Row",        eq: "dumbbell", cat: "pull" },
  pullup:     { name: "Pull-up",               eq: "bodyweight", cat: "pull" },
  pushdown:   { name: "Triceps Pushdown",      eq: "machine",  cat: "arms" },
  curl:       { name: "Dumbbell Curl",         eq: "dumbbell", cat: "arms" },
  lateral:    { name: "DB Lateral Raise",      eq: "dumbbell", cat: "shoulders" },
  facepull:   { name: "Face Pull",             eq: "machine",  cat: "shoulders" },
  legpress:   { name: "Leg Press",             eq: "machine",  cat: "legs" },
  legcurl:    { name: "Leg Curl",              eq: "machine",  cat: "legs" },
  legext:     { name: "Leg Extension",         eq: "machine",  cat: "legs" },
  splitsquat: { name: "Bulgarian Split Squat", eq: "dumbbell", cat: "legs" },
  hipthrust:  { name: "Hip Thrust",            eq: "barbell",  cat: "hinge" },
  calf:       { name: "Standing Calf Raise",   eq: "machine",  cat: "legs" },
  legraise:   { name: "Hanging Leg Raise",     eq: "bodyweight", cat: "core" },
  cablecrunch:{ name: "Cable Crunch",          eq: "machine",  cat: "core" },
};

export const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"];

// type: main = 3×5 linear, secondary = 3×6-8 double progression, acc = double progression.
export const PROGRAM = [
  { key: "upper-a", label: "Upper A", focus: "Bench", slots: [
    { slot: "ua1", ex: "bench",    type: "main",      sets: 3, reps: [5, 5] },
    { slot: "ua2", ex: "row",      type: "secondary", sets: 3, reps: [6, 8] },
    { slot: "ua3", ex: "dbpress",  type: "acc",       sets: 3, reps: [8, 12] },
    { slot: "ua4", ex: "pulldown", type: "acc",       sets: 3, reps: [8, 12] },
    { slot: "ua5", ex: "pushdown", type: "acc",       sets: 3, reps: [10, 15] },
  ]},
  { key: "lower-a", label: "Lower A", focus: "Squat", slots: [
    { slot: "la1", ex: "squat",    type: "main",      sets: 3, reps: [5, 5] },
    { slot: "la2", ex: "rdl",      type: "secondary", sets: 3, reps: [6, 8] },
    { slot: "la3", ex: "legpress", type: "acc",       sets: 3, reps: [8, 12] },
    { slot: "la4", ex: "legcurl",  type: "acc",       sets: 3, reps: [8, 12] },
    { slot: "la5", ex: "calf",     type: "acc",       sets: 3, reps: [10, 15] },
  ]},
  { key: "upper-b", label: "Upper B", focus: "Press", slots: [
    { slot: "ub1", ex: "ohp",      type: "main",      sets: 3, reps: [5, 5] },
    { slot: "ub2", ex: "incline",  type: "secondary", sets: 3, reps: [6, 8] },
    { slot: "ub3", ex: "cablerow", type: "acc",       sets: 3, reps: [8, 12] },
    { slot: "ub4", ex: "lateral",  type: "acc",       sets: 3, reps: [12, 15] },
    { slot: "ub5", ex: "curl",     type: "acc",       sets: 3, reps: [8, 12] },
  ]},
  { key: "lower-b", label: "Lower B", focus: "Deadlift", slots: [
    { slot: "lb1", ex: "deadlift", type: "main",      sets: 3, reps: [5, 5] },
    { slot: "lb2", ex: "frontsquat", type: "secondary", sets: 3, reps: [6, 8] },
    { slot: "lb3", ex: "splitsquat", type: "acc",     sets: 3, reps: [8, 12] },
    { slot: "lb4", ex: "legext",   type: "acc",       sets: 3, reps: [10, 15] },
    { slot: "lb5", ex: "legraise", type: "acc",       sets: 3, reps: [8, 15] },
  ]},
];

export const REST_DEFAULTS = { main: 180, secondary: 150, acc: 90, extra: 90 };
export const RAMP = { 1: 0.7, 2: 0.8 }; // week -> fraction of old working weight

export function exInfo(exId, custom = {}) {
  return LIBRARY[exId] || custom[exId] || { name: exId, eq: "machine", cat: "other" };
}

// ---------- math ----------
export function e1rm(w, r) {
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

export function roundTo(w, eq, unit) {
  if (w == null) return null;
  const step = unit === "kg" ? (eq === "dumbbell" ? 2 : 2.5) : 5;
  return Math.max(0, Math.round(w / step) * step);
}

export function increment(type, cat, unit) {
  const lb = unit !== "kg";
  if (type === "main") return (cat === "squat" || cat === "hinge") ? (lb ? 10 : 5) : (lb ? 5 : 2.5);
  return lb ? 5 : 2.5;
}

// From an old top set (weight × reps) to a 3×5 working weight.
export function workingFromTopSet(w, r, unit) {
  if (!w || !r) return null;
  return roundTo(e1rm(w, r) * 0.81, "barbell", unit);
}

export function barWeight(unit) { return unit === "kg" ? 20 : 45; }

export function plates(total, unit) {
  const bar = barWeight(unit);
  if (!total || total <= bar) return [];
  const avail = unit === "kg" ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
  let side = (total - bar) / 2;
  const out = [];
  for (const p of avail) {
    while (side >= p - 1e-9) { out.push(p); side -= p; }
  }
  return out;
}

export function warmups(work, unit) {
  const bar = barWeight(unit);
  if (!work || work <= bar + 10) return [];
  const steps = [[0, 8], [0.4, 5], [0.6, 3], [0.8, 2]];
  const out = [];
  const seen = new Set();
  for (const [pct, r] of steps) {
    const w = pct === 0 ? bar : roundTo(work * pct, "barbell", unit);
    if (w < bar || w >= work || seen.has(w)) continue;
    seen.add(w);
    out.push({ w, r });
  }
  return out;
}

// ---------- schedule ----------
export function weekNumber(startDate, date) {
  const a = new Date(startDate + "T00:00:00");
  const b = new Date(date + "T00:00:00");
  return Math.max(1, Math.floor((b - a) / (7 * 86400000)) + 1);
}

// Next day in the rotation after the last finished program session.
export function nextDayKey(sessions) {
  const done = sessions
    .filter((s) => s.finishedAt && PROGRAM.some((d) => d.key === s.dayKey))
    .sort((a, b) => b.finishedAt - a.finishedAt);
  if (!done.length) return PROGRAM[0].key;
  const i = PROGRAM.findIndex((d) => d.key === done[0].dayKey);
  return PROGRAM[(i + 1) % PROGRAM.length].key;
}

export function dayByKey(key) { return PROGRAM.find((d) => d.key === key); }

// ---------- prescription ----------
// lift: { weight, old, ramp, fails }
export function prescribedWeight(lift, slotType, week, eq, unit) {
  if (eq === "bodyweight") return 0;
  if (!lift || lift.weight == null) return null; // find your weight
  if (lift.ramp && lift.old && RAMP[week] && (slotType === "main")) {
    return roundTo(lift.old * RAMP[week], eq, unit);
  }
  return lift.weight;
}

export function buildExercise(slot, ctx) {
  const { lifts, swaps, custom, week, unit, lastSets } = ctx;
  const exId = (swaps && swaps[slot.slot]) || slot.ex;
  const info = exInfo(exId, custom);
  const lift = lifts[exId];
  const w = prescribedWeight(lift, slot.type, week, info.eq, unit);
  const prev = lastSets ? lastSets(exId) : null;
  const sets = [];
  if (slot.type === "main" && w) {
    for (const wu of warmups(w, unit)) sets.push({ w: wu.w, r: wu.r, done: false, warmup: true });
  }
  for (let i = 0; i < slot.sets; i++) {
    let reps = slot.reps[0];
    // Double progression: keep last time's reps when the weight hasn't changed.
    if (slot.reps[0] !== slot.reps[1] && prev && prev[i] && prev[i].w === w) {
      reps = Math.min(slot.reps[1], Math.max(slot.reps[0], prev[i].r));
    }
    sets.push({ w: w ?? "", r: reps, done: false, warmup: false });
  }
  return {
    slot: slot.slot, exId, name: info.name, eq: info.eq, cat: info.cat,
    type: slot.type, target: { sets: slot.sets, reps: slot.reps, w },
    find: w == null, sets,
  };
}

// ---------- progression ----------
// Returns { lifts: newLifts, changes: [{exId, name, from, to, note}] }
export function applyProgression(session, lifts, unit) {
  const next = structuredClone(lifts);
  const changes = [];
  const week = session.week || 99;
  for (const ex of session.exercises) {
    if (ex.type === "extra") continue;
    const work = ex.sets.filter((s) => !s.warmup);
    const done = work.filter((s) => s.done);
    if (!done.length) continue;
    const lift = next[ex.exId] || (next[ex.exId] = { weight: null, fails: 0 });
    const [lo, hi] = ex.target.reps;
    const from = lift.weight;

    if (ex.eq === "bodyweight") {
      if (done.length === work.length && done.every((s) => Number(s.r) >= hi)) {
        changes.push({ exId: ex.exId, name: ex.name, from: null, to: null, note: "Top of rep range — try a harder variation or add weight" });
      }
      continue;
    }

    if (ex.find || lift.weight == null) {
      const good = done.filter((s) => Number(s.r) >= lo).map((s) => Number(s.w));
      const pick = good.length ? Math.max(...good) : Math.max(...done.map((s) => Number(s.w)));
      lift.weight = roundTo(pick, ex.eq, unit);
      lift.fails = 0;
      lift.ramp = false;
      changes.push({ exId: ex.exId, name: ex.name, from: null, to: lift.weight, note: "Working weight set" });
      continue;
    }

    const presc = Number(ex.target.w);
    const allDone = done.length === work.length;
    const atWeight = done.every((s) => Number(s.w) >= presc);
    const inRamp = ex.type === "main" && lift.ramp && RAMP[week];

    if (inRamp) {
      if (week === 2) lift.ramp = false; // ramp ends; week 3 resumes at the working weight
      changes.push({ exId: ex.exId, name: ex.name, from: presc, to: week === 2 ? lift.weight : roundTo(lift.old * RAMP[2], ex.eq, unit), note: `Re-entry week ${week}` });
      continue;
    }

    if (ex.type === "main") {
      const hit = allDone && atWeight && done.every((s) => Number(s.r) >= lo);
      if (hit) {
        lift.weight = roundTo(lift.weight + increment("main", ex.cat, unit), ex.eq, unit);
        lift.fails = 0;
        changes.push({ exId: ex.exId, name: ex.name, from, to: lift.weight, note: "All reps hit" });
      } else {
        lift.fails = (lift.fails || 0) + 1;
        if (lift.fails >= 2) {
          lift.weight = roundTo(lift.weight * 0.9, ex.eq, unit);
          lift.fails = 0;
          changes.push({ exId: ex.exId, name: ex.name, from, to: lift.weight, note: "Missed twice — reset 10% and build back" });
        } else {
          changes.push({ exId: ex.exId, name: ex.name, from, to: from, note: "Missed reps — repeat this weight" });
        }
      }
    } else {
      const topped = allDone && atWeight && done.every((s) => Number(s.r) >= hi);
      if (topped) {
        lift.weight = roundTo(lift.weight + increment(ex.type, ex.cat, unit), ex.eq, unit);
        changes.push({ exId: ex.exId, name: ex.name, from, to: lift.weight, note: "Top of rep range — add weight" });
      }
    }
  }
  return { lifts: next, changes };
}

// ---------- analysis ----------
export function setVolume(s) { return s.done && !s.warmup ? Number(s.w || 0) * Number(s.r || 0) : 0; }

export function sessionVolume(sess) {
  return sess.exercises.reduce((t, ex) => t + ex.sets.reduce((a, s) => a + setVolume(s), 0), 0);
}

export function convert(w, from, to) {
  if (from === to || !w) return Number(w) || 0;
  return to === "kg" ? w / 2.20462 : w * 2.20462;
}
