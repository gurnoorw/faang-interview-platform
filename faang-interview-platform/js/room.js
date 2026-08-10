/**
 * room.js — Interview room lifecycle and live metrics
 *
 * Responsibilities:
 *  - Tab switching (Problem | Code | Whiteboard)
 *  - Countdown timer
 *  - Live score bars + pressure meter
 *  - Silence detector (auto-nudge after CONFIG.SILENCE_THRESHOLD_S seconds)
 *  - Code editor + line numbers sync
 *  - Live code review (CODEWATCH every CONFIG.CODE_WATCH_INTERVAL_MS)
 *  - Chat: send message, render bubbles, classify interviewer intent
 *  - Code submission handler
 */

/* ── Module-level state ────────────────────────────────────────────────── */
const ROOM = (() => {
  let _round       = null;   // 'DSA' | 'HLD' | 'LLD' | 'BEH' | 'AI'
  let _problem     = null;   // problem object from QB
  let _history     = [];     // [{role, content}] conversation history
  let _msgCount    = 0;
  let _submitCount = 0;
  let _wordCount   = 0;
  let _pressure    = 18;     // 0–100 pressure meter
  let _lastCode    = '';     // debounce code review
  let _ivBusy      = false;  // true while waiting for Claude
  let _lastActTime = Date.now();

  let _timerHandle  = null;
  let _evalHandle   = null;
  let _watchHandle  = null;
  let _silHandle    = null;
  let _timeLeft     = 0;

  /* ── Setup ────────────────────────────────────────────────────────── */

  function start(round, problem) {
    _round       = round;
    _problem     = problem;
    _history     = [];
    _msgCount    = 0;
    _submitCount = 0;
    _wordCount   = 0;
    _pressure    = 18;
    _lastCode    = '';
    _ivBusy      = false;
    _lastActTime = Date.now();

    // Interviewer persona per round
    const personas = {
      DSA: { name: 'Priya Sharma',   role: 'Senior SDE-3 · Amazon',        emoji: '👩‍💻' },
      HLD: { name: 'Rahul Gupta',    role: 'Staff Engineer · Meta',         emoji: '🧑‍💼' },
      LLD: { name: 'Ananya Krishnan',role: 'Principal Engineer · Flipkart', emoji: '👩‍🔬' },
      BEH: { name: 'Vikram Nair',    role: 'Engineering Manager · Google',  emoji: '👨‍💼' },
      AI:  { name: 'Aisha Rajan',    role: 'ML Lead · DeepMind',            emoji: '👩‍🔬' },
    };
    const iv = personas[round] || personas.DSA;

    // Update header UI
    document.getElementById('rh-badge').textContent = round;
    document.getElementById('rh-q').textContent     = problem.title;
    document.getElementById('iv-emo').textContent   = iv.emoji;
    document.getElementById('iv-nm').textContent    = iv.name;
    document.getElementById('iv-rl').textContent    = iv.role;

    // Reset chat
    document.getElementById('chat').innerHTML       = '';
    document.getElementById('cri-wrap').innerHTML   =
      '<div style="font-size:0.7rem;color:var(--mut);padding:3px">Start coding — interviewer watching...</div>';

    // Timer
    _timeLeft = (problem.timeMin || CONFIG.DEFAULT_TIME_MIN) * 60;
    _renderTimer();
    clearInterval(_timerHandle);
    _timerHandle = setInterval(() => {
      _timeLeft--;
      _renderTimer();
      if (_timeLeft <= 0) ROOM.endInterview();
    }, 1000);

    // Periodic eval + code watch + silence
    clearInterval(_evalHandle);  _evalHandle  = setInterval(_doEval,       CONFIG.EVAL_INTERVAL_MS);
    clearInterval(_watchHandle); _watchHandle = setInterval(_watchCode,    CONFIG.CODE_WATCH_INTERVAL_MS);
    clearInterval(_silHandle);   _silHandle   = setInterval(_silenceCheck, CONFIG.SILENCE_CHECK_MS);

    _resetScores();
    _updatePressureBar();
  }

  function stopTimers() {
    clearInterval(_timerHandle);
    clearInterval(_evalHandle);
    clearInterval(_watchHandle);
    clearInterval(_silHandle);
  }

  /* ── Chat ─────────────────────────────────────────────────────────── */

  /**
   * Add a message bubble to the chat panel.
   * @param {string} text     — message content (will be textContent, XSS-safe)
   * @param {'iv'|'me'|'sys'} type  — bubble style
   * @param {string} [sender] — display name
   * @param {string} [mtype]  — '' | 'int' | 'prob' | 'corr' (adds badge)
   */
  function addMsg(text, type, sender, mtype = '') {
    const area = document.getElementById('chat');
    const div  = document.createElement('div');
    div.className = `msg ${type} ${mtype}`;

    if (type !== 'sys') {
      const nameRow = document.createElement('div');
      nameRow.className = 'msnd';
      const n = document.createElement('span');
      n.textContent = sender || (type === 'iv' ? 'Interviewer' : 'You');
      nameRow.appendChild(n);

      if (mtype === 'int' || mtype === 'prob' || mtype === 'corr') {
        const tag = document.createElement('span');
        tag.className = `mtag mt-${mtype}`;
        tag.textContent = mtype === 'int' ? 'REDIRECT' : mtype === 'prob' ? 'CHALLENGE' : 'CORRECTION';
        nameRow.appendChild(tag);
      }
      div.appendChild(nameRow);
    }

    const txt = document.createElement('div');
    txt.textContent = text;   // textContent = no XSS
    div.appendChild(txt);

    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    _msgCount++;
  }

  function addSystemMsg(text) { addMsg(text, 'sys', '', ''); }

  /** Classify interviewer message to give it a visual badge. */
  function _classifyMsg(text) {
    const l = text.toLowerCase();
    if (/wait|hold on|that won't|no,|stop|let me stop/.test(l)) return 'int';
    if (/what if|edge case|what about|prove|convince|what happens/.test(l)) return 'prob';
    if (/actually|instead|not quite|better approach|incorrect/.test(l)) return 'corr';
    return '';
  }

  /* ── Send message ─────────────────────────────────────────────────── */

  async function sendMessage(text) {
    if (!text.trim() || _ivBusy) return;

    _lastActTime = Date.now();
    const ivName = document.getElementById('iv-nm').textContent;

    addMsg(text, 'me', 'You');
    _wordCount += text.split(/\s+/).length;
    _updateSpeechStats();

    _history.push({ role: 'user', content: text });
    if (_history.length > CONFIG.HISTORY_CAP) _history = _history.slice(-CONFIG.HISTORY_CAP);

    _ivBusy = true;
    _setIvStatus('s-think', 'Thinking...');

    // Typing indicator
    const typingEl = _addTypingIndicator(ivName);

    const reply = await callClaude(_history, _problem.systemPrompt);
    typingEl.remove();

    if (reply) {
      _history.push({ role: 'assistant', content: reply });
      addMsg(reply, 'iv', ivName, _classifyMsg(reply));
      _setIvStatus('s-watch', 'Watching your approach...');
      _doEval();
      _pressure = Math.min(95, _pressure + 7);
      _updatePressureBar();
    } else {
      addSystemMsg('Connection issue — please try again.');
      _setIvStatus('s-watch', 'Watching...');
    }
    _ivBusy = false;
  }

  function _addTypingIndicator(ivName) {
    const area = document.getElementById('chat');
    const div  = document.createElement('div');
    div.className = 'msg iv';
    div.id = 'typing-indicator';
    div.innerHTML = `<div class="msnd">${sanitise(ivName)}</div><div>●●●</div>`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    return div;
  }

  /* ── Live code watch ─────────────────────────────────────────────── */

  async function _watchCode() {
    const code = document.getElementById('ced')?.value.trim();
    if (!code || code === _lastCode || code.length < 60 || _ivBusy || !_problem?.systemPrompt) return;
    _lastCode = code;

    _setIvStatus('s-think', 'Reviewing your code...');

    const prompt =
      `Candidate is solving "${_problem.title}". Current code:\n\n${code.substring(0, 700)}\n\n` +
      `Do a live code review. Return ONLY JSON:\n` +
      `{"items":[{"type":"crit|warn|good|info","text":"specific 1-line observation"}]}`;

    const raw = await callClaude(
      [{ role: 'user', content: prompt }],
      `FAANG interviewer doing live code review for "${_problem.title}". Be specific. Return ONLY JSON.`,
      300
    );

    _setIvStatus('s-watch', 'Watching...');
    if (!raw) return;

    try {
      const data  = JSON.parse(raw.replace(/```json|```/g, '').trim());
      const items = data.items || [];
      _renderCodeReview(items);

      // Auto-interrupt if critical issue found
      const crits = items.filter(i => i.type === 'crit');
      if (crits.length > 0 && !_ivBusy) {
        await _triggerInterrupt(`I see an issue — ${crits[0].text}. Fix that before moving on.`, 'int');
      }
    } catch (_) {}
  }

  function _renderCodeReview(items) {
    const wrap = document.getElementById('cri-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    items.forEach(item => {
      const d = document.createElement('div');
      d.className = `cri ${item.type || 'info'}`;
      const ico = document.createElement('span');
      ico.className = 'criico';
      ico.textContent = item.type === 'crit' ? '✗' : item.type === 'warn' ? '⚠' : item.type === 'good' ? '✓' : '→';
      const t = document.createElement('span');
      t.textContent = item.text;
      d.appendChild(ico); d.appendChild(t);
      wrap.appendChild(d);
    });
  }

  /* ── Auto-interrupt (silence / code issue) ────────────────────────── */

  async function _triggerInterrupt(text, mtype) {
    if (_ivBusy) return;
    _ivBusy = true;
    _setIvStatus('s-int', 'Interrupting...');
    const ivName = document.getElementById('iv-nm').textContent;
    _history.push({ role: 'assistant', content: text });
    addMsg(text, 'iv', ivName, mtype || 'int');
    _pressure = Math.min(95, _pressure + 10);
    _updatePressureBar();
    await new Promise(r => setTimeout(r, 1800));
    _ivBusy = false;
    _setIvStatus('s-watch', 'Watching...');
  }

  /* ── Silence detector ─────────────────────────────────────────────── */

  function _silenceCheck() {
    const silentSec = (Date.now() - _lastActTime) / 1000;
    if (silentSec > CONFIG.SILENCE_THRESHOLD_S && _msgCount > 0 && !_ivBusy) {
      const nudges = [
        "You've gone quiet. What's your current thinking — talk me through it.",
        "I'm not seeing progress. What are you stuck on?",
        "Even a rough approach is fine — tell me what you're considering.",
      ];
      const msg = nudges[Math.floor(Math.random() * nudges.length)];
      _triggerInterrupt(msg, 'prob');
      _lastActTime = Date.now();   // reset so we don't spam
    }
  }

  /* ── Evaluation bars ─────────────────────────────────────────────── */

  function _doEval() {
    if (_msgCount < 2) return;
    const base = Math.min(42 + _msgCount * 2.5, 80);
    _updateMetric('ps', Math.round(Math.min(90, base + (Math.random() * 6 - 3))));
    _updateMetric('cm', Math.round(Math.min(88, base + (Math.random() * 6 - 1))));
    const used = (_problem?.timeMin || 45) * 60 - _timeLeft;
    const tot  = (_problem?.timeMin || 45) * 60;
    _updateMetric('tm', used < tot * 0.7 ? 80 : used < tot * 0.9 ? 58 : 34);
    _pressure = Math.min(95, _pressure + (_msgCount > 5 ? 3 : 1));
    _updatePressureBar();
  }

  function _updateMetric(key, score) {
    const scEl = document.getElementById(`sc-${key}`);
    const flEl = document.getElementById(`fl-${key}`);
    const ntEl = document.getElementById(`nt-${key}`);
    if (!scEl) return;

    const cls = score >= 75 ? 'sg' : score >= 55 ? 'sm' : 'sb';
    const barCls = score >= 75 ? 'fg' : score >= 55 ? 'fm' : 'fb';
    scEl.className = `ems ${cls}`;
    scEl.textContent = `${score}/100`;
    if (flEl) { flEl.className = `emf ${barCls}`; flEl.style.width = `${score}%`; }

    const notes = {
      ps: ['Strong approach', 'Structure your thinking', 'Need clearer approach'],
      cm: ['Explaining clearly', 'Think aloud more', 'Verbalise!'],
      cq: ['Clean code', 'Needs refactoring', 'Focus on code quality'],
      tm: ['On track', 'Slightly slow', 'Pick up the pace!'],
    };
    if (ntEl && notes[key]) ntEl.textContent = notes[key][score >= 75 ? 0 : score >= 55 ? 1 : 2];
  }

  function _resetScores() {
    ['ps','cm','cq','tm'].forEach(k => {
      const s = document.getElementById(`sc-${k}`);
      const f = document.getElementById(`fl-${k}`);
      if (s) { s.className = 'ems sm'; s.textContent = '—'; }
      if (f) { f.style.width = '0%'; }
    });
  }

  function _updatePressureBar() {
    const f = document.getElementById('pzf');
    const l = document.getElementById('pzlbl');
    if (!f) return;
    f.style.width = `${_pressure}%`;
    const cls = _pressure < 40 ? 'pz-lo' : _pressure < 70 ? 'pz-mi' : 'pz-hi';
    f.className = `pzf ${cls}`;
    if (l) {
      l.className = `pzlbl ${cls}`;
      l.textContent = _pressure < 40 ? 'Low — warming up' : _pressure < 70 ? 'Medium — getting serious' : 'High — FAANG pressure';
    }
  }

  /* ── Timer ────────────────────────────────────────────────────────── */

  function _renderTimer() {
    const el = document.getElementById('tmr');
    if (!el) return;
    const m = Math.floor(_timeLeft / 60);
    const s = _timeLeft % 60;
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    el.style.color = _timeLeft < 300 ? '#f87171' : _timeLeft < 600 ? '#f59e0b' : '';
  }

  /* ── Status badge ─────────────────────────────────────────────────── */

  function _setIvStatus(cls, txt) {
    const el = document.getElementById('iv-st');
    if (el) el.className = `iv-status ${cls}`;
    const tEl = document.getElementById('iv-st-txt');
    if (tEl) tEl.textContent = txt;
  }

  /* ── Speech stats ─────────────────────────────────────────────────── */

  function _updateSpeechStats() {
    const wpmEl  = document.getElementById('wpm');
    const fillEl = document.getElementById('fill');
    if (_wordCount > 0) {
      if (wpmEl)  wpmEl.textContent  = Math.round(Math.min(165, 85 + Math.random() * 55));
      if (fillEl) fillEl.textContent = Math.floor(Math.random() * 5);
    }
  }

  /* ── Code submission ─────────────────────────────────────────────── */

  async function submitCode() {
    const code = document.getElementById('ced')?.value;
    const lang = document.getElementById('lsel')?.value || 'python';
    if (!code?.trim()) { addSystemMsg('Write some code first!'); return; }

    _submitCount++;
    APP.showRoomLoading('Analysing your solution...');

    const reply = await callClaude(
      [{ role: 'user', content: `Candidate submitted ${lang} solution for "${_problem.title}":\n\n${code}\n\nAs their FAANG interviewer, react: find a bug or weakness OR if correct, ask a follow-up challenge. 2-3 sentences.` }],
      _problem.systemPrompt + '\nReact to a code submission as a FAANG SDE-3 interviewer.'
    );

    APP.hideRoomLoading();

    if (reply) {
      const ivName = document.getElementById('iv-nm').textContent;
      _history.push({ role: 'user', content: `[Submitted ${lang} solution]` });
      _history.push({ role: 'assistant', content: reply });
      addMsg(reply, 'iv', ivName, _classifyMsg(reply));
      _updateMetric('cq', Math.min(88, 42 + _submitCount * 15 + Math.round(Math.random() * 10)));
      _pressure = Math.min(95, _pressure + 8);
      _updatePressureBar();
    }
  }

  /* ── End interview ─────────────────────────────────────────────────── */

  async function endInterview() {
    stopTimers();
    stopAllMedia();   // media.js — stops camera + mic

    const code = document.getElementById('ced')?.value || '';
    const timeUsedSec = ((_problem?.timeMin || 45) * 60) - _timeLeft;

    APP.showRoomLoading('Generating your detailed feedback...');

    const fb = await generateFeedback({
      round: _round,
      problem: _problem,
      history: _history,
      code,
      timeUsedSec,
      msgCount:    _msgCount,
      submitCount: _submitCount,
    });

    APP.hideRoomLoading();
    renderFeedback(fb, _problem, _round);
    APP.showScreen('feedback');
  }

  /* ── Public API ────────────────────────────────────────────────────── */
  return {
    start,
    stopTimers,
    endInterview,
    sendMessage,
    submitCode,
    addMsg,
    addSystemMsg,
    updateLastActivity() { _lastActTime = Date.now(); },
    get round()   { return _round; },
    get problem() { return _problem; },
    get history() { return _history; },
  };
})();

/* ── Helper: code editor line numbers ─────────────────────────────────── */

function updateLineNumbers() {
  const ced = document.getElementById('ced');
  const lns = document.getElementById('lns');
  if (!ced || !lns) return;
  const count = ced.value.split('\n').length;
  lns.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
}

function syncEditorScroll() {
  const ced = document.getElementById('ced');
  const lns = document.getElementById('lns');
  if (ced && lns) lns.scrollTop = ced.scrollTop;
}

/** Set code editor content and refresh line numbers. */
function setEditorCode(code) {
  const ced = document.getElementById('ced');
  if (ced) { ced.value = code; updateLineNumbers(); }
}

/** Swap starter code when language changes. */
function onLanguageChange() {
  const prob = ROOM.problem;
  if (!prob) return;
  const lang = document.getElementById('lsel')?.value || 'python';
  setEditorCode((prob.starterCode || {})[lang] || (prob.starterCode || {}).python || '');
}

/* ── Helper: tab switching in room ────────────────────────────────────── */

function roomTabSwitch(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  const paneId = name === 'prob' ? 'pp' : name === 'code' ? 'pc' : 'pw';
  const pane   = document.getElementById(paneId);
  if (pane) pane.classList.add('active');
  if (name === 'wb') setTimeout(initWhiteboard, 40);
}

/* ── Helper: render problem content ───────────────────────────────────── */

function renderProblemContent(prob) {
  const container = document.getElementById('prob-content');
  if (!container) return;

  const diffClass = prob.difficulty === 'hard' ? 'dh' : prob.difficulty === 'medium' ? 'dm' : 'de';
  const diffLabel = prob.difficulty === 'hard' ? '🔴 Hard' : prob.difficulty === 'medium' ? '🟡 Medium' : '🟢 Easy';

  let html = `<div style="display:flex;align-items:center;gap:0.65rem;flex-wrap:wrap;margin-bottom:0.65rem">
    <div class="ph">${sanitise(prob.title)}</div>
    ${prob.difficulty ? `<span class="dbadge ${diffClass}">${diffLabel}</span>` : ''}
    ${prob.source ? `<a href="${sanitise(prob.sourceUrl||'#')}" target="_blank" rel="noopener" class="lc-link">${sanitise(prob.source)}</a>` : ''}
  </div>
  <div class="pbod">${sanitise(prob.description || '').replace(/\n/g,'<br>')}</div>`;

  // Examples
  (prob.examples || []).forEach((ex, i) => {
    html += `<div class="pex">
      <div class="exl">Example ${i + 1}</div>
      <div class="exc">${sanitise(ex.input || '').replace(/\n/g,'<br>')}</div>
      ${ex.output ? `<div class="exc" style="color:#a8d8a8">→ ${sanitise(ex.output)}</div>` : ''}
    </div>`;
  });

  // Constraints
  if (prob.constraints?.length) {
    html += `<div><div class="exl" style="margin-top:0.5rem">Constraints</div>
      <ul class="pclist">${prob.constraints.map(c => `<li>${sanitise(c)}</li>`).join('')}</ul></div>`;
  }

  // Expected coverage (HLD/LLD)
  if (prob.expectedCoverage?.length) {
    html += `<div><div class="exl" style="margin-top:0.5rem">Expected coverage</div>
      <ul class="pclist">${prob.expectedCoverage.map(c => `<li>${sanitise(c)}</li>`).join('')}</ul></div>`;
  }

  // NFRs
  if (prob.nfrs?.length) {
    html += `<div><div class="exl" style="margin-top:0.5rem">Non-functional requirements</div>
      <ul class="pclist">${prob.nfrs.map(n => `<li>${sanitise(n)}</li>`).join('')}</ul></div>`;
  }

  container.innerHTML = html;
}
