// Local state, persistence, v1 migration, and the record view used by sync.
import { MAIN_LIFTS, workingFromTopSet } from "./engine.js";

const KEY = "wt.state.v2";
const V1_KEY = "workoutlog.entries";

export const todayStr = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function blank() {
  return {
    settings: {
      onboarded: false,
      unit: "lb",
      days: [1, 2, 4, 5], // Mon Tue Thu Fri
      rest: { main: 180, secondary: 150, acc: 90, extra: 90 },
      startDate: todayStr(),
      lifts: {},
      swaps: {},
      custom: {},
      updatedAt: 0,
    },
    sessions: [],
    bodyweight: [],
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.settings) return { ...blank(), ...s, settings: { ...blank().settings, ...s.settings, unit: "lb" } };
  } catch {}
  const s = blank();
  const migrated = migrateV1();
  if (migrated.length) {
    s.sessions = migrated;
  }
  return s;
}

// v1 stored flat set entries; group them into one finished session per day.
export function migrateV1(entries) {
  try {
    entries = entries || JSON.parse(localStorage.getItem(V1_KEY)) || [];
  } catch { entries = []; }
  if (!Array.isArray(entries) || !entries.length) return [];
  const byDate = {};
  for (const e of entries) (byDate[e.date] ||= []).push(e);
  return Object.entries(byDate).map(([date, list]) => {
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const exMap = new Map();
    const notes = [];
    for (const e of list) {
      if (e.kind === "cardio") { notes.push(`${e.cardioType} cardio ${e.minutes} min`); continue; }
      const id = "custom:" + e.exercise.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (!exMap.has(id)) exMap.set(id, { slot: null, exId: id, name: e.exercise, eq: "barbell", cat: "other", type: "extra", target: { sets: 0, reps: [0, 0], w: null }, sets: [] });
      exMap.get(id).sets.push({ w: e.weight, r: e.reps, done: true, warmup: false });
    }
    const ts = list[0].ts || new Date(date + "T12:00:00").getTime();
    return {
      id: "v1-" + date, date, dayKey: "imported", label: "Imported workout", week: null,
      unit: list.find((e) => e.unit)?.unit || "lb",
      exercises: [...exMap.values()], notes: notes.join(", "),
      startedAt: ts, finishedAt: list[list.length - 1].ts || ts, applied: true, updatedAt: ts,
    };
  });
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  for (const fn of listeners) fn();
}

export const get = () => state;
export const onChange = (fn) => listeners.add(fn);

// ---------- dirty tracking for sync ----------
const DIRTY_KEY = "wt.dirty";
let dirty = (() => { try { return JSON.parse(localStorage.getItem(DIRTY_KEY)) || {}; } catch { return {}; } })();
const saveDirty = () => localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
export const getDirty = () => dirty;
export function markDirty(id, kind, deleted = false) {
  dirty[id] = { kind, deleted, at: Date.now() };
  saveDirty();
}
export function clearDirty(ids) {
  for (const id of ids) delete dirty[id];
  saveDirty();
}
export function markAllDirty() {
  if (state.settings.onboarded) markDirty("settings", "settings");
  for (const s of state.sessions) markDirty(s.id, "session");
  for (const b of state.bodyweight) markDirty(b.id, "bw");
}

// ---------- mutations ----------
export function updateSettings(fn) {
  fn(state.settings);
  state.settings.updatedAt = Date.now();
  markDirty("settings", "settings");
  persist();
}

export function upsertSession(sess) {
  sess.updatedAt = Date.now();
  const i = state.sessions.findIndex((s) => s.id === sess.id);
  if (i >= 0) state.sessions[i] = sess; else state.sessions.push(sess);
  markDirty(sess.id, "session");
  persist();
}

export function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  markDirty(id, "session", true);
  persist();
}

export function addBodyweight(value, date = todayStr()) {
  const existing = state.bodyweight.find((b) => b.date === date);
  const rec = existing || { id: "bw-" + date, date };
  rec.value = value;
  rec.updatedAt = Date.now();
  if (!existing) state.bodyweight.push(rec);
  markDirty(rec.id, "bw");
  persist();
}

export function completeOnboarding({ unit, days, bodyweight, tops }) {
  const lifts = {};
  for (const id of MAIN_LIFTS) {
    const t = tops[id];
    const old = t ? workingFromTopSet(t.w, t.r, unit) : null;
    lifts[id] = old
      ? { weight: Math.round((old * 0.9) / (unit === "kg" ? 2.5 : 5)) * (unit === "kg" ? 2.5 : 5), old, ramp: true, fails: 0 }
      : { weight: null, fails: 0 };
  }
  updateSettings((s) => {
    s.unit = unit; s.days = days; s.lifts = lifts; s.swaps = s.swaps || {};
    s.startDate = todayStr(); s.onboarded = true;
  });
  if (bodyweight) addBodyweight(bodyweight);
}

export function replaceAll(next) {
  state = { ...blank(), ...next, settings: { ...blank().settings, ...next.settings } };
  markAllDirty();
  persist();
}

export function clearAll() {
  state = blank();
  localStorage.removeItem(KEY);
  dirty = {}; saveDirty();
  persist();
}

// ---------- sync record view ----------
export function recordFor(id, kind) {
  if (kind === "settings") return { data: state.settings, updatedAt: state.settings.updatedAt };
  const list = kind === "session" ? state.sessions : state.bodyweight;
  const r = list.find((x) => x.id === id);
  return r ? { data: r, updatedAt: r.updatedAt } : null;
}

// Apply a remote row; last write wins unless the local copy is newer and unsynced.
export function applyRemote(row, silent = true) {
  const remoteAt = new Date(row.updated_at).getTime();
  const local = recordFor(row.id, row.kind);
  if (dirty[row.id] && local && local.updatedAt > remoteAt) return false;
  if (row.kind === "settings") {
    if (row.deleted) return false;
    if (state.settings.updatedAt > remoteAt && dirty.settings) return false;
    state.settings = { ...blank().settings, ...row.data };
  } else {
    const key = row.kind === "session" ? "sessions" : "bodyweight";
    state[key] = state[key].filter((x) => x.id !== row.id);
    if (!row.deleted) state[key].push(row.data);
  }
  delete dirty[row.id];
  saveDirty();
  if (!silent) persist();
  return true;
}

export const flush = persist;
