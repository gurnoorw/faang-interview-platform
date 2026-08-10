# AI & Technical Concepts in the FAANG Interview Platform

*What an SDE-3 needs to know about every AI and systems concept used in this codebase.*

---

## 1. Large Language Models — How Claude Works

**What it is:** A transformer-based autoregressive language model. It predicts the next token given all previous tokens. Every call to the Anthropic Messages API is a stateless request — the model has no persistent memory between calls.

**How we use it:** Every `callClaude()` invocation in `api.js` sends the entire conversation context (system prompt + message history) as a single HTTP request. The model "remembers" the interview because *we* send its memory to it each time, not because it stores anything.

**What an SDE-3 must know:**
- **Tokens ≠ words.** 1 token ≈ 0.75 English words. A 45-min interview history of 24 turns at ~300 chars each is roughly 2,400 tokens of context — well within Claude's 200K context window, but pricing scales linearly with input tokens.
- **Temperature = 0 for evaluation, higher for generation.** We don't set temperature explicitly (Claude defaults to ~1.0), which is intentional: deterministic evaluation rubrics would benefit from `temperature: 0`, but interviewer responses need variation. A production system would tune this per call type.
- **Max tokens ≠ total tokens.** `maxTokens` in our config controls the *output* budget only. Input tokens (the prompt) are billed separately and aren't bounded here.
- **Latency is network + generation time.** At 2,800 output tokens (our feedback call), expect 15–30s. This is why we show a loading overlay and have a 5-attempt retry loop with 1.2s gaps.

---

## 2. Prompt Engineering

This codebase uses six distinct prompt engineering patterns. Understanding each is table-stakes for any LLM systems work.

### 2a. Persona Injection
Every call includes a system prompt that assigns the model a role: "You are a FAANG SDE-3 interviewer." This constrains the model's persona, tone, vocabulary, and implicit goals. The system prompt is the highest-priority instruction in the Anthropic Messages API.

```javascript
// api.js — system prompt separate from user messages
const body = {
  system: systemPrompt,   // persona + constraints
  messages: messages,     // conversation history
};
```

**Why it works:** The model's RLHF training makes it highly compliant with explicit role assignments. Specifying the persona ("FAANG Staff Engineer") activates relevant knowledge distributions in the model's weights.

### 2b. Constraint Injection
System prompts include behavioral constraints: "Keep replies 1–3 sentences", "probe every design decision", "be forensically honest." These reduce variance and prevent the model from being generically helpful rather than adversarially probing.

**SDE-3 insight:** Constraints fight against the model's training signal to be helpful and agreeable. Without "do not give solutions directly", the model will hint or solve. Explicit negation is often necessary.

### 2c. Structured Output (JSON Forcing)
The feedback prompt instructs Claude to return a specific JSON schema and then we extract it:

```javascript
// feedback.js
const raw = await callClaude(messages, systemPrompt, 2800);
const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
```

**Why this works (and why it's fragile):**
- Models fine-tuned on code heavily associate JSON syntax with structured data tasks — if you describe a schema and say "return ONLY valid JSON", compliance is high.
- The `.replace(/```json|```/g, '')` strip exists because the model sometimes wraps output in markdown fences despite instructions not to.
- The fallback object (on `JSON.parse` failure) prevents the UI from crashing when the model misbehaves.

**Production alternative:** Use tool use / function calling, which guarantees schema adherence by routing through the model's structured output mechanism rather than relying on instruction following.

### 2d. Few-Shot / Rubric-Priming
Embedding rubric definitions directly in the feedback prompt primes the model to reason about the interview through those specific lenses. Without rubrics, the model gives generic "communicate better" feedback. With rubrics, it references specific dimensions like "Trade-off Articulation" and "SDE-3 Ownership Signals."

```javascript
// feedback.js — rubric text injected verbatim into the prompt
const rubricsText = rubrics.map((r, i) =>
  `${i + 1}. "${r.name}" [weight: ${r.weight}]\n   Evaluate: ${r.probe}`
).join('\n');
```

**SDE-3 insight:** This is prompt-as-specification. The quality of the rubric probe strings directly determines the quality of the evaluation. Vague probes produce vague feedback. Every probe in `_getRubrics()` in `feedback.js` is written to be adversarial and specific ("Did they state AND prove time AND space complexity? Were claims correct?").

### 2e. Token Budgeting
Different call types get different `maxTokens`:

| Call type | Max tokens | Reason |
|---|---|---|
| Interviewer replies | CONFIG default (~1500) | Short, conversational |
| AI round questions | 400 | One JSON object |
| AI round evaluation | 900 | Model solution + feedback |
| Full feedback report | 2800 | 7 sections of structured JSON |
| Code review | 500 | Quick assessment |

Overprovisioning tokens wastes money. Under-provisioning causes truncated JSON that fails to parse. This is why the feedback has a retry loop — if the model hits its token budget mid-JSON, the parse fails and we retry.

### 2f. Context Summarization via HISTORY_CAP
We cap conversation history at 24 turns (`HISTORY_CAP` in `room.js`). Older turns are dropped. This is a primitive form of context management — in production you would summarize old turns via a separate "compression" call rather than truncating.

---

## 3. Multi-Turn Conversation Architecture

**The core insight:** LLMs are stateless functions `f(context) → next_token`. "Memory" is an illusion created by appending responses to the context and sending the whole thing on the next call.

```javascript
// room.js — how conversation state is maintained
_history.push({ role: 'user',      content: userMessage });
_history.push({ role: 'assistant', content: modelReply  });

// On next call: pass the full _history array
const reply = await callClaude(_history, systemPrompt, maxTokens);
```

**Role alternation requirement:** The Anthropic Messages API requires strict user/assistant alternation. Two consecutive user messages cause a 400 error. This is why `room.js` is careful to always push both roles.

**Context window cost:** Sending 24 turns × 300 chars ≈ 1,800 tokens of input on every message. In a real production system at scale, this becomes expensive. Techniques: RAG (retrieve only relevant turns), hierarchical summarization, or fine-tuning a domain-specific model with compressed memory.

---

## 4. Rate Limiting and Backpressure

Anthropic imposes RPM (requests per minute) and TPM (tokens per minute) limits per API key. We implement a simple double-lock:

```javascript
// api.js
let _callPending = false;
let _lastCall    = 0;

async function callClaude(messages, systemPrompt, maxTokens) {
  if (_callPending) return null;            // lock: one call at a time
  const gap = Date.now() - _lastCall;
  if (gap < MIN_GAP_MS) {                  // rate: 800ms minimum between calls
    await new Promise(r => setTimeout(r, MIN_GAP_MS - gap));
  }
  _callPending = true;
  try { ... } finally { _callPending = false; _lastCall = Date.now(); }
}
```

**Why the feedback retry loop exists:** The live code review fires every 9 seconds on a `setInterval`. When `endInterview()` is called, the code review might have a pending API call holding `_callPending = true`. The feedback call would get `null`, crash, and show no feedback. The retry loop (5 attempts × 1.2s) gives the in-flight call time to complete before we try again.

**SDE-3 concern:** This is a single-tab solution. In a multi-tab or multi-user scenario, you need server-side rate limiting with a token bucket or leaky bucket algorithm, not a browser-side flag.

---

## 5. Web Speech API — Continuous Voice Recognition

The Web Speech API is a browser-native interface to the underlying OS speech recognition engine (Google on Chrome, Apple on Safari). It is not ML we control — it's a black box we drive.

**The auto-restart problem:** The `SpeechRecognition` object stops automatically after:
- A long pause (~3–5s of silence)
- ~60s of continuous operation in some Chromium versions
- Network errors (it's server-side in Chrome)

Our solution:

```javascript
// media.js
rec.onend = () => {
  if (_micOn) _scheduleRestart(SR);  // always restart if mic is supposed to be on
};

function _scheduleRestart(SR) {
  clearTimeout(_restartTimer);
  _restartTimer = setTimeout(() => {
    if (_micOn) _launchRecognition(SR, _micLang);
  }, 250);  // 250ms debounce prevents rapid restart loops
}
```

**Language cascade:** `en-IN` (Indian English) has better accent support but may not be available on all setups. On `language-not-supported` error, we fall back to `en-US`. This is a UX decision — failing silently to `en-US` is better than showing an error.

**Interim vs final results:** The API emits two types of results:
- `isFinal: false` → interim (partial transcript, updated as you speak)
- `isFinal: true` → final (committed, won't change)

We display interim results live in the overlay and only act on final results (send to chat, count words, detect fillers). This gives real-time visual feedback without spamming the chat.

---

## 6. Natural Language Processing — Filler Word Detection

This is rule-based NLP, not ML. We maintain a `FILLER_MAP` of known filler words across four semantic categories:

```javascript
const FILLERS = {
  hesitation: ['um', 'uh', 'er', 'ah', 'hmm'],
  discourse:  ['like', 'basically', 'literally', 'actually', 'obviously'],
  metacomm:   ['you know', 'i mean', 'you see', 'sort of', 'kind of'],
  restart:    ['so', 'well', 'okay', 'anyway'],
};
```

**Two-pass detection:**
1. Multi-word phrases first (substring match on the full text): catches "you know", "sort of"
2. Single words against tokenized array (word-boundary match after lowercasing and stripping punctuation)

**Why not ML?** For this use case, rule-based wins: zero latency (runs in the browser, synchronously), zero cost, zero privacy risk (no audio sent anywhere), perfectly explainable outputs, and sufficient precision for the coaching use case. An ML approach would add model loading overhead and potential false positives on domain terms like "basically correct" being flagged.

**Limitation:** We don't handle homophones, context-dependent fillers ("like" as comparison vs filler), or cross-sentence discourse markers. A production coaching tool would use an NLP pipeline with POS tagging and dependency parsing to distinguish usage types.

---

## 7. IIFE Module Pattern

Every major module (`ROOM`, `QB`, `COMM_TRACKER`, `AI_ROUND`) is an Immediately Invoked Function Expression:

```javascript
const ROOM = (() => {
  let _private = ...;          // closure — invisible outside

  function _internalHelper() { ... }

  return {
    start,                     // only these are public
    sendMessage,
    endInterview,
  };
})();
```

**What this achieves:**
- **Encapsulation:** `_history`, `_round`, `_pressure` are invisible to the console and to other modules. You cannot accidentally mutate them.
- **No class syntax:** Avoids prototype chain complexity and `this` binding issues in callbacks. All internal functions close over the same variables naturally.
- **Single global per module:** `ROOM` is one object with a defined public API, not a bag of global functions.

**SDE-3 insight:** This is the pre-ES6 module pattern. Modern alternatives are ES Modules (`import`/`export`) or bundled CommonJS/ESM via Webpack/Vite. We use IIFE because the project has no build step — all scripts are loaded directly via `<script>` tags, where ES Modules would require `type="module"` and break dynamic `<script>` ordering guarantees.

---

## 8. State Machine Design

The `AI_ROUND` module implements an explicit state machine with four states:

```
IDLE → GENERATING_QUESTION → AWAITING_ANSWER → SHOWING_SOLUTION → (repeat)
```

```javascript
// airound.js
let _state = 'IDLE';

async function _generateQuestion() {
  _state = 'GENERATING_QUESTION';
  // ... async Claude call ...
  _state = 'AWAITING_ANSWER';
}

async function _evaluateAnswer(candidateAnswer) {
  if (_state !== 'AWAITING_ANSWER') return;  // guard: wrong state
  _state = 'SHOWING_SOLUTION';
  // ...
}
```

**Why explicit state machines?** Without the state variable, the user could submit an answer while a question is being generated, or click "Next" while evaluation is in flight. The state check `if (_state !== 'AWAITING_ANSWER') return` prevents all of these races with a single guard.

**SDE-3 concern:** This is a single-threaded JS state machine. In a distributed system (multiple servers handling the same session), you'd need external state (Redis, DynamoDB) with conditional writes (optimistic locking or compare-and-swap) to prevent concurrent state transitions.

---

## 9. Polling Intervals and Timer Management

The platform runs four concurrent `setInterval` loops during an interview:

| Timer | ID | Interval | Purpose |
|---|---|---|---|
| Countdown | `_timerInterval` | 1000ms | Update clock, check time expiry |
| Eval bar animation | `_evalInterval` | 14000ms | Simulated score drift (cosmetic) |
| Live code review | `_codeRevInterval` | 9000ms | Trigger async Claude call |
| Silence detector | `_silenceCheck` | 30000ms | Nudge if no activity in 30s |

**The critical rule:** Every interval must be cleared on interview end. Missing one causes memory leaks and phantom API calls after the session ends. `stopTimers()` in `room.js` clears all four in one shot, and `endInterview()` calls it first.

**Waveform animation** runs on a 75ms `setInterval` (media.js) — this is separate from the above and is cleared by `_stopWaveform()`.

**SDE-3 insight:** `setInterval` in browsers doesn't guarantee exact timing — tabs hidden by the browser OS (via Page Visibility API) have their timers throttled to 1-minute intervals. We hook `visibilitychange` to stop the mic when the tab is hidden, which also prevents the silence detector from firing incorrectly.

---

## 10. XSS Prevention

Any user-controlled text that enters the DOM must be sanitized. We use a textContent-based sanitizer:

```javascript
// api.js
function sanitise(str) {
  if (!str) return '';
  const el = document.createElement('div');
  el.textContent = String(str);
  return el.innerHTML;
}
```

**Why this works:** `textContent` escapes all HTML special characters by the browser's own parser: `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `&` → `&amp;`. `el.innerHTML` then reads back the escaped version. The output is safe to inject via `innerHTML`.

**What we protect:** All Claude response text, all user messages, all problem titles and descriptions, all feedback text. These all pass through `sanitise()` before touching `innerHTML`.

**What we don't protect (and why it's safe):** Values set via `el.textContent = value` directly — `textContent` never parses HTML, so there's no injection vector.

**SDE-3 concern:** A CSP (Content Security Policy) header is the defense-in-depth layer we'd add in production. Without CSP, a successful XSS (e.g., if we forgot a sanitise() call) could execute arbitrary scripts. CSP `default-src 'self'` would prevent inline script execution even if injection occurs.

---

## 11. Canvas API — Whiteboard

The whiteboard in `whiteboard.js` uses the HTML5 Canvas 2D drawing context:

```javascript
const ctx = canvas.getContext('2d');
ctx.beginPath();
ctx.moveTo(startX, startY);
ctx.lineTo(currentX, currentY);
ctx.stroke();
```

**Key concepts used:**
- **Path operations:** `beginPath()`, `moveTo()`, `lineTo()`, `arc()` — define shapes
- **Rendering:** `stroke()` renders paths, `fill()` fills closed shapes
- **State stack:** `save()` / `restore()` for isolating tool configurations (line width, color, dash patterns)
- **Erase:** We use `ctx.clearRect()` with a circular clip, not a white brush — so the background remains transparent

**SDE-3 insight:** Canvas is immediate-mode rendering — you paint pixels, not a retained scene graph. This means you can't "click a shape and move it" without re-implementing hit testing and re-rendering from scratch. For collaborative whiteboards (Figma, Miro), this is solved with SVG or WebGL + retained object models, which is an order of magnitude more complex.

---

## 12. FAANG Rubric Design — Evaluation Framework

The rubric system in `feedback.js` is a structured evaluation framework modeled on real FAANG hiring committee criteria. Understanding *why* these rubrics exist is as important as knowing they do.

**Round-specific rubric coverage:**

| Round | Primary rubrics (high weight) | Universal rubrics (medium weight) |
|---|---|---|
| DSA | Algorithm Selection, Complexity Analysis, Code Quality | Edge Cases, Think-Aloud, Adaptability |
| HLD | Requirements/Scale Estimation, System Architecture, Data Modeling, Scalability | Reliability/Fault Tolerance, Trade-offs, Communication |
| LLD | OOP & SOLID, Design Patterns, Class Structure, Concurrency Safety | Extensibility, Code Quality, Communication |
| BEH | STAR Structure, Impact Scope, SDE-3 Ownership | LP Alignment, Adversity Handling, Communication |
| AI | Conceptual Foundation, Mathematical Depth, Practical ML, ML System Design | Communication & Teaching Clarity |

**The SDE-3 bar specifically tests:**
1. *Scope of impact* — did the candidate demonstrate cross-team or org-level impact, not just individual execution?
2. *Ambiguity handling* — did they drive to clarity independently rather than waiting for directions?
3. *Depth under pressure* — did they hold positions with evidence, or capitulate when challenged?
4. *Technical breadth* — could they design a system end-to-end, not just implement a component?

**Why rubrics are embedded in the prompt (not computed by code):** The model has contextual understanding of the interview transcript that a rule-based scorer cannot match. By giving the rubric to the model as part of the evaluation prompt, we delegate the "did this conversation demonstrate X?" judgment to the model, which has far more nuanced language understanding than pattern matching could provide.

---

## 13. localStorage Persistence Strategy

Three distinct namespaces in localStorage:

| Key | Contents | Type | Cleared by |
|---|---|---|---|
| `anthropic_api_key` | API key string | String | User manually / auth error |
| `faang_qb_v3` | Question bank (all 5 rounds) | JSON | QB.clear() |
| `faang_sessions_v1` | Interview session history | JSON | HISTORY.clear() |

**What is intentionally ephemeral (in-memory only):**
- `_history` — the live conversation array in room.js
- Canvas whiteboard state
- Code editor content
- COMM_TRACKER metrics during session

These are lost on tab close. The design decision: only completed, evaluated sessions are worth persisting. In-progress session recovery would require periodic auto-save and crash recovery logic — meaningful complexity for marginal benefit in a solo practice tool.

**Version suffix (`_v3`, `_v1`):** When the data schema changes incompatibly, bump the suffix. Old keys become orphaned and can be cleaned up by a migration helper. Never mutate an existing schema in place — old browser tabs still have the old structure in memory.

**Storage limits:** localStorage is synchronous and capped at ~5–10MB per origin. With 100 sessions × ~3KB each = 300KB — well within limits. JSON serialization is synchronous and blocks the main thread; for large datasets, IndexedDB with async reads is the right choice.

---

## 14. The Anthropic Messages API — Request Anatomy

```javascript
// api.js — the full request shape
const body = {
  model:      CONFIG.API_MODEL,       // 'claude-sonnet-4-6'
  max_tokens: maxTokens,
  system:     systemPrompt,           // top-level, not in messages array
  messages:   messages,               // [{role:'user'|'assistant', content:'...'}]
};

const res = await fetch(CONFIG.API_URL, {
  method:  'POST',
  headers: {
    'Content-Type':                             'application/json',
    'x-api-key':                                apiKey,
    'anthropic-version':                        '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',  // bypasses CORS block
  },
  body: JSON.stringify(body),
});
```

**`anthropic-dangerous-direct-browser-access: true`:** Anthropic's API normally blocks browser-origin requests (CORS restriction) to prevent API key exposure in front-end code. This header explicitly opts into browser access. The "dangerous" label is accurate — the API key in localStorage is visible to any JavaScript running on the page. In production: keys live server-side, the browser calls your backend, your backend calls Anthropic.

**Error handling flow:**
- `401 Unauthorized` → key is invalid → clear key, show API key modal
- `429 Too Many Requests` → rate limited → retry with backoff (not currently implemented beyond the in-call gap)
- `5xx` → Anthropic service issue → surface error message

---

## 15. What an SDE-3 Should Be Able to Design From Scratch

If you're asked to design this system in a system design interview, here's the SDE-3 answer:

**Browser-only (current):**
- Single-origin HTML/CSS/JS, no server
- API key in localStorage (acceptable for personal tool, unacceptable for multi-user)
- All state ephemeral per tab

**Production multi-user version:**
- **Auth:** OAuth 2.0 (Google/GitHub SSO), JWT sessions
- **Backend:** Node.js or Go API server handling session management, calling Anthropic from the server side (key never sent to browser)
- **Persistence:** PostgreSQL for users/sessions/history, Redis for live session state (shared across reconnects)
- **Voice:** Move Speech Recognition to server-side ASR (Whisper or Google STT) for cross-browser compatibility and transcript persistence
- **Scalability:** Anthropic calls are slow (15–30s) — use async job queues (SQS/Kafka) for feedback generation, WebSocket push for real-time progress updates
- **Monitoring:** Token usage tracking per user (cost attribution), latency P99 alerting, error rate dashboards

---

*This document covers every non-trivial technical decision in the platform. For the design rationale and architecture overview, see DESIGN.md.*
