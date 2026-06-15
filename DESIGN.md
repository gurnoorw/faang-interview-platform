# Design Document — FAANG Mock Interview Platform

> **Audience:** Anyone reviewing this codebase — interviewers, collaborators, or your future self six months from now.  
> **Scope:** Architecture decisions, module responsibilities, data flow, technology choices, and a detailed comparison with a Java backend approach.

---

## 1. What This System Does

The platform simulates a real FAANG technical interview loop inside a single browser tab. There is no server, no database, and no build step. The user opens `index.html`, enters an Anthropic API key, picks a round type and problem, and is dropped into a live interview session where:

- An AI persona (e.g., "Priya Sharma, SDE-3 · Amazon") runs the conversation via Claude
- The candidate types or speaks their answers
- A live code editor with syntax-highlighted line numbers tracks their solution
- A whiteboard canvas is available for system design rounds
- Periodic background polling sends the current code to Claude for live review every 9 seconds
- A silence detector fires a nudge if the candidate goes quiet for more than 100 seconds
- A live eval panel updates score bars for Problem Solving, Communication, Code Quality, and Time Management in real time
- At the end, a full 8-section feedback report is generated and can be exported as a `.txt` file

**Five round types are supported:** DSA (algorithm + code), HLD (high-level system design), LLD (low-level OOP design), Behavioural (STAR probing), and AI Knowledge (5-level progressive quiz).

---

## 2. High-Level Architecture

```
Browser
│
├── index.html          ← single HTML shell, all screens rendered here
│
├── css/                ← styling only, no logic
│   ├── base.css        ← design tokens (CSS variables), resets, animations
│   ├── home.css        ← home screen layout
│   ├── room.css        ← 3-column interview room layout
│   ├── feedback.css    ← post-interview feedback report
│   └── airound.css     ← AI knowledge round pane
│
└── js/                 ← all application logic
    ├── config.js       ← tunable constants (model, timers, thresholds)
    ├── api.js          ← Anthropic API wrapper (rate limiting, auth, error handling)
    ├── questions.js    ← QB: question bank with defaults + localStorage persistence
    ├── media.js        ← camera (local-only) + Web Speech API microphone
    ├── whiteboard.js   ← canvas drawing: pen, shapes, arrows, text, eraser
    ├── airound.js      ← AI knowledge round: 5-level progression, solution reveal
    ├── feedback.js     ← feedback generation via Claude + 8-section renderer + export
    ├── interviewer.js  ← interviewer mode UI: add/edit/delete questions per round
    ├── room.js         ← room lifecycle: timer, chat, code review, eval bars, silence
    └── app.js          ← top-level controller: routing, launch, home, retry
```

There is no bundler (no webpack, vite, or esbuild). Scripts are loaded in dependency order via plain `<script src="...">` tags. This was a deliberate choice — see Section 6 for the reasoning.

---

## 3. Module Breakdown

### 3.1 `config.js` — Central Constants

A single `CONFIG` object holds every magic number in the system. No other file hard-codes timers, model names, or thresholds. When you want to change how often code review fires or raise the silence threshold, you change one line here.

| Constant | Default | Effect |
|---|---|---|
| `API_MODEL` | `claude-sonnet-4-6` | Which Claude model all calls use |
| `API_MIN_GAP_MS` | 900 ms | Minimum gap between consecutive API calls |
| `SILENCE_THRESHOLD_S` | 100 s | Silence before interviewer nudges candidate |
| `CODE_WATCH_INTERVAL_MS` | 9000 ms | Live code review polling frequency |
| `EVAL_INTERVAL_MS` | 14000 ms | How often score bars update |
| `HISTORY_CAP` | 24 turns | Max conversation history kept in memory |
| `AI_CORRECT_TO_ADVANCE` | 3 | Correct answers needed to advance an AI level |
| `DEFAULT_TIME_MIN` | 45 | Fallback interview duration |

---

### 3.2 `api.js` — Claude API Wrapper

All Claude calls go through a single `callClaude(messages, systemPrompt, maxTokens)` function. It enforces:

- **Rate limiting:** calls are blocked if fewer than `API_MIN_GAP_MS` milliseconds have elapsed since the last call.
- **Pending lock:** a `_callPending` boolean prevents two simultaneous in-flight requests.
- **Authentication:** the API key is read from `window._ANTHROPIC_KEY` (runtime override) or `localStorage`. If neither is set, a setup modal is shown.
- **Required headers:** `x-api-key`, `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true` — the third is mandatory for direct browser → Anthropic API calls (Anthropic's CORS policy requires it).
- **Auth error recovery:** if a 401 authentication error comes back, the stored key is cleared and the setup modal is shown again.

The function returns the text of the first content block, or `null` on rate-limit, lock, or error. Every caller handles `null` gracefully (typically falling back to a static message).

**XSS safety:** a `sanitise(str)` helper uses `el.textContent = str; return el.innerHTML` to escape any string that needs to go into an `innerHTML` context. All user-supplied text is inserted with `textContent` directly, never `innerHTML`.

---

### 3.3 `questions.js` — Question Bank (QB)

`QB` is an IIFE (Immediately Invoked Function Expression) that manages a persistent question bank across five round types: DSA, HLD, LLD, BEH, AI.

**Storage:** `localStorage` key `faang_qb_v3`. On load, if the key is absent or corrupt, it falls back to built-in defaults and writes them to storage.

**Public API:**

| Method | What it does |
|---|---|
| `QB.get(round)` | Returns a shallow copy of the question array for a round |
| `QB.add(round, q)` | Assigns a unique ID (`q_{timestamp}_{random}`) and persists |
| `QB.update(id, patch)` | Merges patch object into the matching question and saves |
| `QB.remove(id)` | Deletes by ID across all rounds, returns `true/false` |
| `QB.reset()` | Clears localStorage and reloads defaults |
| `QB.parseLeetcode(url, text)` | Parses a LeetCode URL + pasted description into a DSA object |

**Default content shipped:**

- DSA: LRU Cache, Merge Intervals, Trapping Rain Water, Word Ladder, Kth Largest in Stream
- HLD: Design Twitter/X, Distributed Rate Limiter, URL Shortener (bit.ly)
- LLD: Parking Lot System, Notification System, Elevator Control System
- BEH: Ownership, Biggest Failure, Influence Without Authority, Disagree & Commit, Decision Under Uncertainty
- AI: ML Fundamentals, Large Language Models, Deep Learning, ML System Design, Generative AI

Every question object includes a `systemPrompt` field that defines the AI interviewer's persona and probing strategy for that specific problem. This is what gets passed as the `system` parameter to every Claude call during that session.

---

### 3.4 `room.js` — Interview Room Lifecycle

`ROOM` is the largest module and is itself an IIFE exposing a public API. It owns the entire interview session from `start()` to `endInterview()`.

**State managed per session:**
- `_round`, `_problem` — what's being interviewed
- `_history` — the conversation array sent to Claude (capped at `HISTORY_CAP` turns)
- `_msgCount`, `_submitCount`, `_wordCount` — metrics for eval bars
- `_pressure` — 0–100 pressure meter that climbs with each message and interrupt
- `_timeLeft` — countdown in seconds
- `_ivBusy` — lock preventing overlapping AI responses
- `_lastActTime` — timestamp used by the silence detector

**Four background intervals run simultaneously:**

1. **Timer** (`setInterval` at 1000ms) — counts down and calls `endInterview()` at zero.
2. **Eval** (`EVAL_INTERVAL_MS`) — updates score bars using message count + time ratio as proxy signals. These are heuristic (no ground-truth scoring during the session) — the real scores come from Claude in the post-interview feedback report.
3. **Code watch** (`CODE_WATCH_INTERVAL_MS`) — diffs the code editor against the last seen snapshot. If the code has changed and exceeds 60 characters, sends it to Claude for a structured review returning `{"items":[{"type":"crit|warn|good|info","text":"..."}]}`. Critical items trigger an automatic interviewer interrupt.
4. **Silence check** (`SILENCE_CHECK_MS`) — fires a random nudge if `_lastActTime` is more than `SILENCE_THRESHOLD_S` seconds ago.

**Message classification:** `_classifyMsg(text)` uses regex patterns to detect interviewer intent and badge the message bubble accordingly: REDIRECT (interruption), CHALLENGE (edge-case probe), or CORRECTION (direct feedback).

**Code submission:** `submitCode()` sends the full code + language to Claude with an instruction to react as a FAANG interviewer — either finding a bug or issuing a follow-up challenge.

---

### 3.5 `app.js` — Top-Level Controller

Handles screen routing (`home → room → feedback`), round/problem selection state, and the `DOMContentLoaded` initialiser. On load it checks for a stored API key and shows the setup modal if none is found.

Key functions: `launchInterview()`, `goHome()`, `retryRound()`, `sendMsg()`, `endInterview()`.

---

### 3.6 `media.js` — Camera and Microphone

Camera: `getUserMedia({video:true})` pipes the stream into a local `<video>` element via `srcObject`. The stream is **never transmitted anywhere** — it is purely local display to simulate interview body language awareness.

Microphone: uses the Web Speech API (`SpeechRecognition`). Only the final transcript text is sent to Claude — the audio itself never leaves the browser. This is one of the strongest privacy arguments for the current architecture.

Teardown hooks are registered on `endInterview()`, `goHome()`, `beforeunload`, and `visibilitychange` (tab hide) to ensure tracks are always stopped.

---

### 3.7 `whiteboard.js` — Canvas Drawing

A full canvas drawing library implemented from scratch. Tools: pen (freehand), rectangle, circle, arrow (with arrowhead), text (inline input), eraser. Supports colour palette and brush size slider. All drawing is stored in-memory only — whiteboard content is not persisted across sessions (this is a known limitation).

---

### 3.8 `airound.js` — AI Knowledge Round

Five progressive difficulty levels (Fundamentals → Application). `AI_ROUND.start(prob)` picks the first question from the topic's subtopics at level 1. On each submission, Claude evaluates the answer and returns a structured JSON verdict: `{correct, feedback, solution, keyPoints, proTip}`. If the candidate answers `AI_CORRECT_TO_ADVANCE` questions correctly, the level advances. Model solutions are always shown — this is explicitly a learning round, not a hidden assessment.

---

### 3.9 `feedback.js` — Post-Interview Report

`generateFeedback({round, problem, history, code, timeUsedSec, msgCount, submitCount})` sends the full conversation history to Claude with an instruction to return a structured JSON report. The report includes: overall score (0–100), verdict (Strong Hire → Strong No Hire), dimension scores (Problem Solving, Communication, Code Quality, Depth Under Pressure), key moments, code analysis, SDE-3 bar assessment, and a 3-item action plan.

`renderFeedback(fb, problem, round)` takes that object and builds the feedback screen DOM. `exportFeedback()` serialises it to a `.txt` file and triggers a download.

---

### 3.10 `interviewer.js` — Question Bank Manager

The Interviewer Mode UI. Handles five panels (DSA, HLD, LLD, BEH, AI) with add/edit/delete forms for each question type. All operations delegate to `QB.add()`, `QB.update()`, `QB.remove()`. The LeetCode import flow calls `QB.parseLeetcode(url, pastedText)` and then `QB.add('DSA', result)`.

---

## 4. Data Flow: A Single Interview Session

```
User picks a problem → launchInterview()
│
├── ROOM.start(round, problem)
│   ├── Sets interviewer persona in DOM
│   ├── Starts countdown timer
│   └── Starts eval, code-watch, silence-check intervals
│
├── callClaude([{role:'user', content:'Begin the interview...'}], problem.systemPrompt)
│   └── Returns opening message → ROOM.addMsg(...)
│
└── User types / speaks
    │
    ├── ROOM.sendMessage(text)
    │   ├── _history.push({role:'user', content:text})
    │   ├── callClaude(_history, problem.systemPrompt)  ← full conversation sent each time
    │   └── _history.push({role:'assistant', content:reply})
    │
    ├── [every 9s] _watchCode()
    │   └── callClaude([{role:'user', content:`Current code: ...`}], review prompt, 300 tokens)
    │       └── Returns JSON → renders code review strip + optional interrupt
    │
    └── User clicks "End & Evaluate"
        └── ROOM.endInterview()
            ├── Stops all intervals + media tracks
            └── generateFeedback({...}) → callClaude([full history + code], feedback prompt, 2000 tokens)
                └── renderFeedback(fb) → APP.showScreen('feedback')
```

**The conversation history is stateless from Claude's perspective.** Every `sendMessage()` call sends the full `_history` array as the `messages` parameter, so Claude always has full context. The `HISTORY_CAP` of 24 turns is a memory/cost trade-off — old turns are sliced off from the front.

---

## 5. Persistence Model

| Data | Storage | Persistence |
|---|---|---|
| Question bank | `localStorage['faang_qb_v3']` | Permanent until cleared |
| API key | `localStorage['anthropic_api_key']` | Permanent until cleared |
| Conversation history | JavaScript variable (`_history`) | Session only |
| Whiteboard canvas | In-memory canvas state | Session only |
| Code editor content | DOM textarea value | Session only |
| Camera/mic | `getUserMedia` streams | Session only |

---

## 6. Why Vanilla JavaScript?

This is the question most backend engineers ask first. Here is the complete reasoning.

### The use case didn't need a framework

React, Vue, and Angular exist to solve the problem of **keeping complex state in sync with a large DOM tree** across many components. This application has three screens (`home`, `room`, `feedback`) and a handful of dynamic regions (chat, code review strip, eval bars, problem grid). All DOM mutations are targeted and explicit — `getElementById` followed by `textContent` or `style`. There is no reactive state that cascades across component trees.

Adding a framework here would mean: installing Node, running a dev server, managing a `node_modules` folder, and learning the framework's mental model — all for no architectural benefit on a codebase of this size.

### Zero-friction deployment

The entire application is a folder of files. Deployment is: put the folder behind any static file server (Nginx, S3, GitHub Pages, Netlify). There is no build step to break, no lockfile to update, no CI pipeline to maintain. Opening `index.html` locally in Chrome works without running any command.

### Privacy constraints demanded it

The camera stream is the critical example. The Web Speech API and `getUserMedia` both require the audio and video to stay in the browser — that is their entire privacy value proposition. Involving a server would require you to either never send media to the server (which a server-rendered app can't easily enforce) or implement a complex media isolation architecture. In a pure browser app, the constraint is architectural: the server literally doesn't exist.

### Direct Claude API access is viable for a personal tool

Calling the Anthropic API directly from the browser exposes your API key to anyone who opens DevTools. For a personal practice tool used by one person (yourself), this is an acceptable trade-off. The key is stored in `localStorage`, not embedded in source code, and the README notes that a backend proxy should be added for any shared deployment.

### Script load order replaces a module bundler

The scripts are loaded in dependency order:
```
config → api → questions → media → whiteboard → airound → feedback → interviewer → room → app
```
Each module reads from the previous ones (e.g., `room.js` calls `callClaude` from `api.js` and `QB.get()` from `questions.js`). This is the oldest JavaScript module pattern — global scope sharing via load order — and it works correctly for a codebase where all files are first-party and the graph is a DAG (no cycles).

---

## 7. What a Java Backend Would Change

This is a meaningful architectural question. Here is a detailed comparison across every concern.

### 7.1 API Key Security

**Current (browser-direct):** The API key lives in `localStorage`. Anyone on the machine can read it from DevTools. Acceptable for personal use; not for shared deployment.

**Java backend:** The key lives in an environment variable on the server (`ANTHROPIC_API_KEY`). The browser never sees it. Every Claude call goes: Browser → Java backend (authenticated) → Anthropic API. This is the correct architecture for a multi-user or shared deployment.

```java
// Spring Boot example
@PostMapping("/api/chat")
public ResponseEntity<ChatResponse> chat(@RequestBody ChatRequest req,
                                          @RequestHeader("Authorization") String jwt) {
    // validate JWT, then proxy to Anthropic
    String response = anthropicClient.chat(req.getMessages(), req.getSystemPrompt());
    return ResponseEntity.ok(new ChatResponse(response));
}
```

### 7.2 Conversation History

**Current:** `_history` is a JavaScript array in the browser tab. Closing the tab loses the entire session. The cap of 24 turns is enforced in JS.

**Java backend:** History can be persisted to a database (PostgreSQL, DynamoDB, Redis). Sessions survive tab closes. Multiple devices can resume the same session. History management (summarisation, eviction) happens on the server where compute is cheap.

```java
// Store conversation in Postgres
conversationRepository.save(new ConversationTurn(sessionId, role, content, timestamp));
List<ConversationTurn> history = conversationRepository.findTop24BySessionIdOrderByTimestampDesc(sessionId);
```

### 7.3 Question Bank

**Current:** `localStorage['faang_qb_v3']`. Questions are per-browser-per-device. Clearing browser data loses your custom question bank.

**Java backend:** Questions live in a proper database. You get CRUD endpoints, versioning, multi-user access (share question sets with your study group), and backups.

### 7.4 Real Code Execution

**Current:** Code execution is simulated — Claude generates realistic-looking output. No code actually runs.

**Java backend:** You can integrate a real sandbox (JDoodle API, Judge0, or a Docker container per execution). The candidate writes Python and it actually executes against real test cases. This is how LeetCode works.

```java
// Proxy to Judge0
@PostMapping("/api/run")
public ExecutionResult runCode(@RequestBody RunRequest req) {
    return judge0Client.submit(req.getCode(), req.getLanguage(), req.getStdin());
}
```

### 7.5 WebSocket / Real-Time

**Current:** All AI responses are request-response via `fetch`. There is no streaming — the user sees the full response appear at once after a short wait.

**Java backend (Spring WebFlux or WebSocket):** You can stream Claude's response token-by-token back to the browser, exactly like ChatGPT's typewriter effect. This significantly improves perceived latency.

```java
// Streaming with Spring WebFlux
@GetMapping(value = "/api/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<String> streamChat(@RequestParam String sessionId) {
    return anthropicClient.streamChat(sessionId);
}
```

### 7.6 Voice / Audio Processing

**Current:** Web Speech API does speech-to-text entirely in Chrome/Edge. It is not available in Firefox, Safari (partially), or mobile browsers. The transcript quality depends on the browser's built-in ASR model. You have no control over it.

**Java backend:** You can route audio to a server-side ASR (Whisper via API, Google Speech-to-Text, AWS Transcribe). This gives cross-browser support, higher accuracy, and the ability to detect filler words, speech rate, and tone — features the current platform only simulates with random numbers.

### 7.7 Analytics and Progress Tracking

**Current:** There is no persistence of performance across sessions. Every interview starts fresh. The feedback report exists only until the tab is closed (or exported as a .txt file).

**Java backend + database:** Every session is stored. You can build a dashboard showing score trends over time, which problem types you're weak on, improvement over the last 30 days, and comparison against historical baselines.

### 7.8 Authentication and Multi-User

**Current:** Single-user by definition. There is no concept of accounts.

**Java backend:** Add Spring Security + JWT (or OAuth via Google/GitHub). Each user has their own question bank, session history, and performance analytics.

---

## 8. Summary: Java Backend Trade-off Table

| Concern | Browser-only (current) | Java backend |
|---|---|---|
| API key security | Exposed in localStorage | Secure — never in browser |
| Question persistence | localStorage (per device) | Database (any device) |
| Session recovery | Lost on tab close | Resumable |
| Code execution | Simulated by Claude | Real sandbox (Judge0/Docker) |
| Response streaming | No (full response at once) | Yes (token-by-token) |
| Voice / ASR | Browser Web Speech API only | Any ASR service, any browser |
| Analytics | None | Full performance history |
| Multi-user | Not possible | Full user accounts |
| Deployment | Open index.html | JVM + DB + infra |
| Time to first run | ~0 seconds | Hours to days |
| Maintenance cost | Zero | JVM, DB, hosting, DevOps |

**The current architecture is the correct choice for a personal practice tool.** It runs in 30 seconds with no setup. The privacy model (no server = no data leakage) is a feature, not a limitation. A Java backend becomes the right choice the moment you want real code execution, multi-user support, persistent analytics, or a shared deployment where the API key must stay secret.

---

## 9. Known Limitations and Future Work

- **Whiteboard is session-only.** Canvas state is not persisted. A future version could serialise strokes to JSON and save to localStorage or a backend.
- **Code execution is simulated.** Claude generates plausible-looking output but does not actually run the code. Integrating Judge0 would fix this.
- **Voice input is Chrome/Edge only.** Web Speech API is not implemented in Firefox. A Whisper-based backend would give cross-browser support.
- **No streaming.** Claude responses appear after a short pause. Streaming (SSE or WebSocket) would give a better UX.
- **API key is visible in DevTools.** Acceptable for personal use; a backend proxy is required for shared deployments.
- **Eval bars are heuristic.** Live score bars are computed from message count and time ratios, not from actual AI evaluation. Real per-message scoring would require significantly more API calls and cost.
- **No session history.** Performance across sessions is not tracked. Adding localStorage-based session logs would enable basic progress tracking without a backend.

---

*Document maintained alongside the codebase. Last updated: June 2026.*
