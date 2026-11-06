# Lift Log

A 4-day Upper/Lower strength app for getting back into the gym. It's a static web app you add to your iPhone home screen. Everything is saved on the phone first, so it works with no signal, and it syncs between devices through Supabase.

## One-time setup

### 1. Supabase (sync)
1. Create a free project at https://supabase.com.
2. **SQL Editor → New query**: paste in `supabase.sql` and run it.
3. **Authentication → Sign In / Providers → Email**: optionally turn off "Confirm email" so you can sign in right away.
4. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key** into `config.js`.
   The anon key is meant to be public; row-level security limits each account to its own rows.

### 2. GitHub Pages (hosting)
```
brew install gh
gh auth login
```
Then publish from this folder (Claude can do this for you once `gh` is logged in):
```
git init && git add -A && git commit -m "Lift Log"
gh repo create lift-log --public --source . --push
gh api -X POST repos/{owner}/lift-log/pages -f "source[branch]=main" -f "source[path]=/"
```
The app will be at `https://<your-username>.github.io/lift-log/` within about a minute.

### 3. On your iPhone
Open that URL in **Safari**, tap **Share → Add to Home Screen**, open it from the new icon, then sign in under ⚙ Settings → Sync.

## Updating
Commit and push. The app picks up the new version the next time you open it twice (the service worker serves the cached copy first, then updates in the background).

## Local testing
`python3 serve.py` serves the app at http://localhost:8642. This is for testing on your computer; use the GitHub Pages URL on your phone.

## Files
- `js/engine.js`: the program, progression rules, warm-ups and plate math
- `js/store.js`: local data, migration from the v1 log, and change tracking for sync
- `js/sync.js`: Supabase auth and sync over plain `fetch` (no SDK)
- `js/charts.js`: SVG charts
- `js/app.js`: the UI
- `legacy-v1/`: the old app, kept for reference
