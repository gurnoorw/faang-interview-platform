# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based AI mock-interview platform for SDE-3 / L5 FAANG prep (DSA, HLD, LLD, Behavioural, AI Knowledge rounds), driven by the Anthropic Messages API. It ships in two forms:

- **Local/free:** serve `index.html` over HTTP and paste an Anthropic key once. No backend, no accounts.
- **Public SaaS (planned):** hosted at `shireacres.com`. Users sign up and pay ₹2000 for 30 days via Razorpay. The Anthropic key stays on the server.

The git root is the parent directory (`../`), which also holds `DESIGN.md` (architecture rationale) and `AI_CONCEPTS.md`. Work happens on the `interviewer` branch; the remote is `github.com/gurnoorw/faang-interview-platform`.

## Project status (as of 2026-11-16)

- The frontend is built. **It has never been smoke-tested end to end in a browser.** An earlier "subagent review" commit message is misleading: that review was a static read-through only, and nothing was executed.
- The backend is built but has **never been run or deployed**.
- Hosting is not started. The env keys (Anthropic, MongoDB Atlas, JWT, Razorpay) may not exist yet, and the domain registrar is unknown.
- Several commits say "Integrated Judge0", but **there is no Judge0 code**. "Run" in the DSA editor is simulated by Claude (`runCodeSimulate` in `index.html`).

Before relying on any feature, run it.

## Commands

There is no build step, bundler, linter, or test suite.

```bash
# Frontend (static) — serve from this directory
python3 -m http.server 8080        # or: npx serve .

# Backend (optional, SaaS mode)
cd backend && npm install
cp .env.example .env               # fill ANTHROPIC_API_KEY, MONGODB_URI, JWT_SECRET, RAZORPAY_*
npm run dev                        # nodemon, port 3001; `npm start` for plain node
curl localhost:3001/api/health
```

Backend CORS only allows `FRONTEND_URL`, `http://localhost:3000`, and `http://localhost:8080`, so serve the frontend on one of those ports when testing against it.

## Frontend architecture

- `index.html` is the single shell containing every screen (`.screen` elements toggled by `APP.showScreen()` in `js/app.js`). It also has an inline `<script>` at the bottom (`runCodeSimulate`). `pages/` holds the standalone `landing.html`, `auth.html` (`?mode=signup|login`) and `payment.html`.
- No modules: plain `<script>` tags loaded in dependency order (`config → api → questions → media → whiteboard → airound → feedback → interviewer → room → app`). Everything shares the global scope, so top-level `const`/`function` definitions in one file are used directly by later files. To add a file, add a `<script>` tag in the right position.
- Global singletons:
  - `CONFIG` (`config.js`): all tunable constants. Keep magic numbers here.
  - `QB` (`questions.js`): the question bank, persisted to localStorage `faang_qb_v3` with a v2 migration. Each question carries its own interviewer `systemPrompt`.
  - `ROOM` (`room.js`): live interview state. `ROOM.start()` runs four intervals (countdown, eval, code watch, silence); `_watchCode` skips BEH/AI.
  - `APP` (`app.js`): routing.
- **All AI calls go through `callClaude(messages, systemPrompt, maxTokens)`** in `api.js`.
  - It returns text or `null`, and **silently drops calls** made within `CONFIG.API_MIN_GAP_MS` of the last one or while another is pending. Callers must handle `null`.
  - Call sites use the bare name `callClaude(...)`. That still picks up the SaaS override, because `api.js` declares it as a top-level `function` and so it lives on `window`. Keep it a classic-script function declaration: changing it to `const`/`let` or an ES module would silently break the proxy swap.
- Live eval bars (problem solving, communication, code quality, WPM, filler words) are **heuristics plus `Math.random()` jitter** in `room.js`, not AI judgments. Only the post-interview report (`feedback.js`) comes from Claude.
- Media: camera video stays local. Only text transcripts reach the AI. `stopAllMedia()` (`media.js`) runs on end, on going home, on `beforeunload` and on `visibilitychange`.
- XSS: render user/AI text via `textContent`. Use `sanitise()` from `api.js` if a string must go through `innerHTML`.

### Not wired in

`js/editor.js` and `js/auth-guard.js` exist but are **not loaded** by `index.html`. SaaS mode therefore cannot activate until `<script src="js/auth-guard.js">` is added **after** `app.js`.

`editor.js` duplicates functions that live in `room.js` (e.g. `updateLineNumbers`). If both were loaded, the later definition would win. Check which copy is live before editing.

## Local vs SaaS mode

- **Local mode** (current default):
  - `api.js` calls `api.anthropic.com` directly with `x-api-key`, `anthropic-version: 2023-06-01` and `anthropic-dangerous-direct-browser-access: true`.
  - Key resolution order: `CONFIG.API_KEY` → localStorage `faang_api_key` → a one-time `prompt()`. The stored key is cleared on a 401.
- **SaaS mode:**
  - `auth-guard.js` activates when `window.API_BASE` or `CONFIG.BACKEND_URL` is set. `CONFIG` has no `BACKEND_URL` key yet; add one.
  - It redirects to `pages/auth.html` or `pages/payment.html` based on the JWT (localStorage `faang_token`, user in `faang_user`) and the subscription status.
  - It replaces `window.callClaude` with a POST to `/api/claude/chat`. That replacement has **no** client-side rate limit or pending lock, unlike `api.js`.
  - `auth-guard.js` **fails open**: if the subscription check has a network error, access is allowed.
- `pages/auth.html` and `pages/payment.html` each define their own `API_BASE`, defaulting to `http://localhost:3001` unless `window.API_BASE` is set before their script.

## Backend (`backend/`)

Express + Mongoose, CommonJS. `server.js` mounts:

- `/api/auth`: signup, login, me
- `/api/payment`: Razorpay create-order, verify, status
- `/api/claude`: the chat proxy

It also serves `backend/public/` as a SPA fallback for single-server deploys.

- `middleware/auth.js`:
  - `requireAuth` turns a Bearer JWT into `req.user`.
  - `requireSubscription` checks `User.isSubscribed()` and returns 403 with `code: 'SUBSCRIPTION_REQUIRED'`. The frontend redirects to payment on that code.
- Rate limits: 200 req/min per IP globally, plus 60 req/min per user on `/api/claude`.
- `/api/claude/chat` caps input on the server: ≤30 messages, 4000 chars each, system prompt ≤2000 chars, `max_tokens` ≤1500. Frontend prompts and history (`CONFIG.HISTORY_CAP`) must fit these limits in SaaS mode. The largest current request is the feedback report at 1400 tokens.
- The model comes from the `ANTHROPIC_MODEL` env var. Its hardcoded fallback in `routes/claude.js` is `claude-sonnet-4-6`, while the frontend's `CONFIG.API_MODEL` is `claude-sonnet-5-5`. Keep the two in sync.
- Payments are a **one-time** Razorpay order. `/verify` checks the HMAC-SHA256 signature and then sets `subscription.endDate = now + 30 days`. Nothing auto-renews.

## Known issues to fix before going public

1. `pages/landing.html` contains invented content: the "Trusted by 500+ engineers" line and placeholder testimonials naming people and companies. Remove it or replace it with real content.
2. The landing page says "Auto-renews monthly · Cancel anytime". This is false. Either implement Razorpay Subscriptions or change the copy to "30 days access, renew manually". There is also no expiry reminder or cancel flow.
3. There is no Razorpay `payment.captured` webhook. A user who pays and closes the tab before `/verify` runs is charged but never activated. `/verify` also does not check that the order belongs to `req.user`.
4. CORS needs `https://www.shireacres.com` added in `server.js`.
5. The live eval numbers (see above) should be labelled as estimates or computed properly.
6. Missing features: tests, structured logging, password reset, email verification, and the terms/privacy pages that `auth.html` refers to.

## Deployment plan (not started)

```
shireacres.com     → Netlify (frontend, publish dir = this directory)
api.shireacres.com → Render  (root dir "backend", build "npm install", start "npm start")
```

Steps:

1. Add `BACKEND_URL: 'https://api.shireacres.com'` to `CONFIG`, and load `auth-guard.js` in `index.html`.
2. Set `window.API_BASE` in `pages/auth.html` and `pages/payment.html`.
3. Deploy the backend on Render with the env vars from `.env.example`. Use `FRONTEND_URL=https://shireacres.com` and `PORT=10000`. For MongoDB Atlas M0, allow `0.0.0.0/0` and use the `/faang_interview` database.
4. Deploy the frontend on Netlify.
5. Add the DNS records:
   - `A @` → Netlify
   - `CNAME www` → `<site>.netlify.app`
   - `CNAME api` → `<service>.onrender.com`
   - No AAAA records (Render rejects domains that have them).
6. Verify `/api/health`.
7. Test signup → Razorpay **test-mode** payment → interview.

The Render free tier sleeps when idle, so the first request after a pause is slow.

## Job Hunt Tracker logging

Each coding session is logged to a job-hunt tracker. A nightly task reads the log from GitHub, so it only counts once pushed.

- At the start of a session, run `date '+%Y-%m-%d %H:%M'` (IST) and note it. If it isn't obvious which task we're on, ask:
  - `p01` run it end to end locally and confirm the model ID
  - `p02` deploy the free demo (Netlify + Render + Atlas, Razorpay test mode)
  - `p03` load your own question bank
  - `p04` README with diagram, demo GIF, live link
  - `p05` 2-minute story, then freeze
- At the end of a session, or when the user says "log it", append ONE line to `.tracker/sessions.jsonl` **at the git root** (`../.tracker/`; create it if missing):
  ```
  {"id":"<YYYY-MM-DD>-<task>-<n>","date":"<YYYY-MM-DD IST>","project":"platform","task":"<p0x>","minutes":<int>,"status":"In progress|Done","demo":"No|Yes","note":"<one line: what works now, what's left>"}
  ```
  - `<n>`: 1 for the first session on that task that day, then 2, 3, …
  - `minutes`: real elapsed time since the session start, minus breaks the user mentions. If the user gives a number, use theirs. Never estimate otherwise; ask.
  - `status`: "Done" only when the user says the task is done AND it works. Otherwise "In progress".
  - `demo`: "Yes" only when the user has seen the feature working end to end.
  - `note`: facts about the code only.
- Commit the line with the code (`chore(tracker): log session <id>`) and push. If the push fails, say so: an unpushed line never reaches the tracker.
- Never edit or delete earlier lines; append a new one to correct something.
