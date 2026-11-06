// Supabase sync over plain fetch: email/password auth + one `records` table.
import * as store from "./store.js";

const cfg = window.WT_CONFIG || {};
const URL_ = (cfg.supabaseUrl || "").replace(/\/$/, "");
const KEY = cfg.supabaseAnonKey || "";
const AUTH_KEY = "wt.auth";
const CURSOR_KEY = "wt.cursor";

export const configured = () => Boolean(URL_ && KEY);

let auth = (() => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; } })();
let status = "off"; // off | idle | syncing | offline | error | pending
let lastError = "";
const listeners = new Set();
export const onStatus = (fn) => listeners.add(fn);
const remoteListeners = new Set();
export const onRemote = (fn) => remoteListeners.add(fn);
const setStatus = (s, err = "") => { status = s; lastError = err; for (const fn of listeners) fn(status, lastError); };
export const getStatus = () => ({ status, lastError, email: auth?.user?.email || null });

function saveAuth(a) {
  auth = a;
  if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY);
}

async function authCall(path, body) {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || `Auth failed (${res.status})`);
  return data;
}

function sessionFrom(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at ? d.expires_at * 1000 : Date.now() + (d.expires_in || 3600) * 1000,
    user: { id: d.user.id, email: d.user.email },
  };
}

export async function signIn(email, password) {
  const d = await authCall("token?grant_type=password", { email, password });
  saveAuth(sessionFrom(d));
  localStorage.removeItem(CURSOR_KEY);
  store.markAllDirty();
  return sync();
}

export async function signUp(email, password) {
  const d = await authCall("signup", { email, password });
  if (!d.access_token) return { confirm: true }; // email confirmation is on
  saveAuth(sessionFrom(d));
  store.markAllDirty();
  await sync();
  return { confirm: false };
}

export function signOut() {
  if (auth) fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${auth.access_token}` } }).catch(() => {});
  saveAuth(null);
  localStorage.removeItem(CURSOR_KEY);
  setStatus("off");
}

async function token() {
  if (!auth) return null;
  if (Date.now() < auth.expires_at - 60000) return auth.access_token;
  try {
    const d = await authCall("token?grant_type=refresh_token", { refresh_token: auth.refresh_token });
    saveAuth(sessionFrom(d));
    return auth.access_token;
  } catch (e) {
    if (navigator.onLine) { saveAuth(null); setStatus("error", "Signed out — please sign in again"); }
    throw e;
  }
}

async function rest(path, opts = {}) {
  const t = await token();
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sync failed (${res.status}): ${body.slice(0, 160)}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

let running = null;
let again = false;

export function sync() {
  if (!configured() || !auth) { setStatus("off"); return Promise.resolve(); }
  if (running) { again = true; return running; }
  running = (async () => {
    if (!navigator.onLine) { setStatus("offline"); return; }
    setStatus("syncing");
    try {
      // push
      const dirty = store.getDirty();
      const ids = Object.keys(dirty);
      if (ids.length) {
        const rows = ids.map((id) => {
          const { kind, deleted, at } = dirty[id];
          const rec = deleted ? null : store.recordFor(id, kind);
          return {
            user_id: auth.user.id, id, kind,
            data: rec ? rec.data : {},
            deleted: !rec,
            updated_at: new Date(rec ? rec.updatedAt || at : at).toISOString(),
          };
        });
        await rest("records?on_conflict=user_id,id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows),
        });
        store.clearDirty(ids.filter((id) => store.getDirty()[id]?.at === dirty[id].at));
      }
      // pull everything the server has seen since our cursor
      const cursor = localStorage.getItem(CURSOR_KEY);
      let q = "records?select=id,kind,data,deleted,updated_at,server_updated_at&order=server_updated_at.asc&limit=1000";
      if (cursor) q += `&server_updated_at=gt.${encodeURIComponent(cursor)}`;
      const rows = await rest(q);
      let changed = false;
      for (const row of rows || []) changed = store.applyRemote(row) || changed;
      if (rows && rows.length) localStorage.setItem(CURSOR_KEY, rows[rows.length - 1].server_updated_at);
      if (changed) { store.flush(); for (const fn of remoteListeners) fn(); }
      setStatus(Object.keys(store.getDirty()).length ? "pending" : "idle");
      if (rows && rows.length === 1000) again = true;
    } catch (e) {
      setStatus(navigator.onLine ? "error" : "offline", e.message);
    }
  })().finally(() => {
    running = null;
    if (again) { again = false; sync(); }
  });
  return running;
}

let timer = null;
export function schedule() {
  if (!auth) return;
  setStatus("pending");
  clearTimeout(timer);
  timer = setTimeout(sync, 1500);
}

export function start() {
  if (!configured()) { setStatus("off"); return; }
  window.addEventListener("online", sync);
  window.addEventListener("offline", () => auth && setStatus("offline"));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
  sync();
}
