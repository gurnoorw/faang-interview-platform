# 🎯 FAANG Mock Interview Platform

A browser-based, AI-powered mock interview platform built for SDE-3 preparation at FAANG companies. No backend required — runs entirely in your browser using the Anthropic Claude API.

---

## ✨ Features

### Two Modes

| Mode | Purpose |
|------|---------|
| **Interviewee Mode** | Practice interviews with an AI FAANG interviewer |
| **Interviewer Mode** | Configure and manage the question bank |

### Round Types

| Round | Tools | What the AI does |
|-------|-------|-----------------|
| **DSA** | Code editor (4 languages), live code review | Probes complexity, edge cases, interrupts on bugs |
| **HLD** | Whiteboard + code | Forces back-of-envelope first, challenges every design decision |
| **LLD** | Code + optional whiteboard | Checks SOLID principles, thread safety, design patterns |
| **Behavioural** | Text / voice | Probes STAR deeply, randomises questions each session |
| **AI Knowledge** | All input forms | 5 progressive levels, always reveals model solution (learning round) |

### Key Capabilities
- 🎥 **Local-only camera** — video never transmitted anywhere
- 🎤 **Voice input** — Web Speech API → only text sent to Claude
- 🔴 **Live code review** every 9 seconds — AI interrupts on critical bugs
- 🔇 **Silence detector** — nudges after 100s of inactivity
- 📊 **Detailed feedback** — 8-section report with score ring, key moments, SDE-3 gap analysis
- 💾 **Persistent question bank** — all questions saved to localStorage
- 📤 **Export report** — download feedback as `.txt`

---

## 🚀 Quick Start

### 1. Get an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account → **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)

### 2. Open the Platform

```bash
# Option A: just open index.html in Chrome or Edge
open index.html

# Option B: serve locally (avoids any CORS issues)
npx serve .
# or
python3 -m http.server 8080
```

### 3. Add Your API Key

Open `js/config.js` and set your key — or set it at runtime in the browser console:

```javascript
// In browser console (does not persist):
window._ANTHROPIC_KEY = 'sk-ant-your-key-here';
```

> **Note:** The platform makes direct API calls from the browser. This is fine for local/personal use. For a shared deployment, add a backend proxy.

---

## 📁 Project Structure

```
faang-interview-platform/
├── index.html              # Single HTML shell — all screens
│
├── css/
│   ├── base.css            # Design tokens, resets, animations, modal
│   ├── home.css            # Home screen: mode toggle, problem grid, interviewer forms
│   ├── room.css            # Interview room: 3-col layout, chat, editor, whiteboard, eval
│   ├── feedback.css        # Post-interview feedback report
│   └── airound.css         # AI knowledge round pane
│
└── js/
    ├── config.js           # All tunable constants (timers, model, thresholds)
    ├── api.js              # Claude API wrapper with rate limiting + XSS sanitise()
    ├── questions.js        # Question bank: defaults + localStorage persistence (QB object)
    ├── media.js            # Camera (local) + microphone (Web Speech API) + teardown hooks
    ├── whiteboard.js       # Canvas whiteboard: pen/rect/circle/arrow/text/erase
    ├── airound.js          # AI knowledge round: 5-level progression + solution reveal
    ├── feedback.js         # Feedback generation (Claude) + multi-section renderer + export
    ├── interviewer.js      # Interviewer mode: question bank manager for all round types
    ├── room.js             # Room lifecycle: timer, chat, code review, eval bars, silence
    └── app.js              # Top-level controller: screen routing, launch, go home
```

---

## 🔧 Configuration (`js/config.js`)

| Constant | Default | Description |
|----------|---------|-------------|
| `API_MODEL` | `claude-sonnet-4-20250514` | Claude model to use |
| `API_MIN_GAP_MS` | `900` | Rate limit gap between API calls |
| `SILENCE_THRESHOLD_S` | `100` | Seconds before silence nudge |
| `CODE_WATCH_INTERVAL_MS` | `9000` | Live code review frequency |
| `AI_CORRECT_TO_ADVANCE` | `3` | Correct answers to advance AI level |
| `HISTORY_CAP` | `24` | Max conversation turns in memory |

---

## 📚 Question Bank

Default questions ship with the platform:

**DSA:** LRU Cache · Merge Intervals · Trapping Rain Water · Word Ladder · Kth Largest in Stream  
**HLD:** Design Twitter · Distributed Rate Limiter · URL Shortener  
**LLD:** Parking Lot · Notification System · Elevator System  
**Behavioural:** Ownership · Biggest Failure · Influence Without Authority · Disagree & Commit · Decision Under Uncertainty  
**AI Topics:** ML Fundamentals · LLMs · Deep Learning · ML System Design · Generative AI

All questions are stored in `localStorage` (key: `faang_qb_v3`) and persist across sessions.

### Adding Questions (Interviewer Mode)

**DSA — LeetCode import:**
1. Switch to **Interviewer Mode**
2. DSA tab → paste the LeetCode URL
3. Copy-paste the problem description → Import

**Design (HLD/LLD) — on the fly:**
1. Enter title + description + expected coverage bullets
2. Optionally write a custom system prompt to control interviewer behaviour
3. The AI will evaluate like a FAANG staff engineer

**Behavioural:**  
Add questions with probe follow-ups and SDE-3 signals. Questions are selected randomly each session.

**AI Knowledge:**  
Add a topic + subtopics. The platform auto-generates questions at 5 difficulty levels and always reveals model solutions (learning mode).

---

## 🔒 Privacy & Security

| Concern | How it's handled |
|---------|-----------------|
| Camera video | `srcObject` only — never transmitted, local display only |
| Microphone audio | Web Speech API stays in browser; only the final transcript text is sent to Claude |
| Media teardown | All tracks stopped on `endInterview()`, `goHome()`, `beforeunload`, and tab hide |
| XSS | All user content rendered via `textContent` only, never `innerHTML` |
| API rate limiting | 900ms minimum gap between calls + pending-call lock |
| Data storage | Questions in `localStorage` only — nothing sent to any server except Claude API |

---

## 🤖 AI Interviewer Personas

Each round has a distinct interviewer with a specific probing style:

| Round | Interviewer | Company | Style |
|-------|------------|---------|-------|
| DSA | Priya Sharma | Amazon | Relentless on O(1) claims, forces scratch implementations |
| HLD | Rahul Gupta | Meta | Back-of-envelope first, celebrity fan-out problem |
| LLD | Ananya Krishnan | Flipkart | SOLID violations, thread-safety gaps |
| BEH | Vikram Nair | Google | STAR probing, SDE-3 scope challenges |
| AI | Aisha Rajan | DeepMind | Progressive difficulty, always educational |

---

## 📊 Feedback Report Sections

After ending an interview, you get an 8-section report:

1. **Score ring** — 0–100 overall with verdict (Strong Hire → Strong No Hire)
2. **Score breakdown** — Problem Solving, Communication, Code Quality, Depth Under Pressure
3. **Key moments** — specific good moments, missed opportunities, and pro tips
4. **Code & algorithmic analysis** — approach, complexity, edge cases, code style
5. **Communication breakdown** — think-aloud, clarifying questions, structure, under pressure
6. **SDE-3 bar assessment** — honest gap analysis
7. **Action plan** — 3 specific practice items for the next 2 weeks
8. **Export** — download full report as `.txt`

---

## 🛠️ Customisation

### Add a new round type
1. Add default questions to `questions.js` under a new key
2. Add a round tab button in `index.html`
3. Add a case in `app.js → launchInterview()` and `room.js → start()`
4. Add an interviewer persona in `room.js → personas`

### Change the interviewer persona for a question
Edit the `systemPrompt` field in `questions.js` or via Interviewer Mode → Edit.

### Adjust live code review aggressiveness
In `js/room.js`, find `_watchCode()` and adjust the system prompt sent to Claude.

---

## 🐛 Known Limitations

- Voice input requires Chrome or Edge (Web Speech API not in Firefox)
- Direct browser → Anthropic API calls require CORS to be allowed (works in development; use a proxy for production)
- Code execution is simulated via Claude (no actual runtime)
- Whiteboard content is not saved across sessions

---

## 📄 License

MIT — free to use, modify, and distribute.

---

*Built for SDE-3 FAANG prep · Bangalore 🇮🇳*
