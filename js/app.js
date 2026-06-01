/**
 * app.js — Top-level application controller
 *
 * Responsibilities:
 *  - Screen routing: home | room | feedback | interviewer
 *  - Interviewee Mode: round selection → problem picker → launch interview
 *  - Interviewer Mode: delegate to interviewer.js (question bank manager)
 *  - Global loading overlay helpers
 */

/* ── App-level state ────────────────────────────────────────────────── */
let _selectedRound   = 'DSA';
let _selectedProbId  = null;
let _currentMode     = 'interviewee';   // 'interviewee' | 'interviewer'

/* ── Screen routing ─────────────────────────────────────────────────── */

const APP = {
  /** Show one screen, hide all others. */
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      el.style.display = 'flex';
    }
  },

  showRoomLoading(msg) {
    const ov = document.getElementById('rlov');
    const tx = document.getElementById('rl-msg');
    if (tx) tx.textContent = msg;
    if (ov) ov.classList.remove('hid');
  },

  hideRoomLoading() {
    const ov = document.getElementById('rlov');
    if (ov) ov.classList.add('hid');
  },
};

/* ── Mode toggle (home screen) ──────────────────────────────────────── */

function setMode(mode, btn) {
  _currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.getElementById('interviewee-home').style.display = mode === 'interviewee' ? 'flex' : 'none';
  document.getElementById('interviewer-home').style.display = mode === 'interviewer'  ? 'flex' : 'none';

  if (mode === 'interviewer') initInterviewerMode();
}

/* ── Round selection (interviewee) ──────────────────────────────────── */

function selectRound(round, btn) {
  _selectedRound  = round;
  _selectedProbId = null;

  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  renderProblemGrid(round);

  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.disabled = true;

  const selInfo = document.getElementById('sel-info');
  if (selInfo) selInfo.textContent = 'Select a problem above';
}

/* ── Problem grid ────────────────────────────────────────────────────── */

function renderProblemGrid(round) {
  const grid = document.getElementById('prob-grid');
  if (!grid) return;

  const problems = QB.get(round);
  grid.innerHTML  = '';

  const pickLabel = document.getElementById('pick-label');
  if (pickLabel) pickLabel.textContent = round === 'BEH' ? 'Behavioural format' : 'Select a problem';

  if (problems.length === 0) {
    grid.innerHTML = `<div style="color:var(--mut);font-size:0.78rem;padding:1rem">
      No questions in this bank yet — add some in Interviewer Mode.
    </div>`;
    return;
  }

  problems.forEach(prob => {
    const diffClass = (prob.difficulty === 'hard' ? 'tag-h' : prob.difficulty === 'medium' ? 'tag-m' : 'tag-e');
    const card = document.createElement('div');
    card.className = 'prob-card';
    card.id = `pc-${prob.id}`;

    card.innerHTML =
      `<div class="pc-tag ${diffClass}">${sanitise(prob.difficulty || 'custom')} · ${sanitise(prob.topic || 'Custom')}</div>
       <div class="pc-title">${sanitise(prob.title || prob.question || 'Question')}</div>
       <div class="pc-sub">${round === 'BEH'
         ? 'Random probing · STAR method'
         : round === 'AI'
           ? `${(prob.subtopics||[]).length} subtopics · 5 levels`
           : `~${prob.timeMin || 45} min · ${sanitise(prob.topic || 'Custom')}`
       }</div>
       <div class="pc-check">✓</div>`;

    card.onclick = () => pickProblem(prob.id, round, card);
    grid.appendChild(card);
  });
}

function pickProblem(id, round, card) {
  _selectedProbId = id;
  document.querySelectorAll('.prob-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  const prob = QB.get(round).find(p => p.id === id);
  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.disabled = false;

  const selInfo = document.getElementById('sel-info');
  if (selInfo) selInfo.textContent = `Selected: ${prob?.title || prob?.question || 'Question'} · ~${prob?.timeMin || 45} min`;
}

/* ── Launch interview ────────────────────────────────────────────────── */

async function launchInterview() {
  if (!_selectedProbId) return;

  const prob = QB.get(_selectedRound).find(p => p.id === _selectedProbId);
  if (!prob) return;

  // Reset code editor
  setEditorCode((prob.starterCode || {}).python || '// Start coding here');

  // Show room
  APP.showScreen('room');
  APP.showRoomLoading('Connecting to your interviewer...');

  // Kick off room module
  ROOM.start(_selectedRound, prob);

  // Render problem tab
  renderProblemContent(prob);

  // For AI round → use AI module
  if (_selectedRound === 'AI') {
    document.getElementById('t-ai').style.display = 'flex';
    roomTabSwitch('ai', document.getElementById('t-ai'));
    APP.hideRoomLoading();
    AI_ROUND.start(prob);
    return;
  }

  // Hide AI tab for non-AI rounds
  const aiTab = document.getElementById('t-ai');
  if (aiTab) aiTab.style.display = 'none';
  roomTabSwitch('prob', document.getElementById('t-prob'));

  // Opening message from interviewer
  const openingMsg = await callClaude(
    [{ role: 'user', content: 'Begin the interview now. One sentence warm intro then your first question.' }],
    prob.systemPrompt
  );

  APP.hideRoomLoading();

  const ivName = document.getElementById('iv-nm').textContent;
  if (openingMsg) {
    ROOM.addMsg(openingMsg, 'iv', ivName, '');
  } else {
    ROOM.addMsg(`I'm ${ivName}. Let's get started — walk me through your initial approach.`, 'iv', ivName, '');
  }
}

/* ── Go home ─────────────────────────────────────────────────────────── */

function goHome() {
  ROOM.stopTimers();
  stopAllMedia();
  _selectedProbId = null;
  APP.showScreen('home');
  if (_currentMode === 'interviewee') renderProblemGrid(_selectedRound);
}

/* ── Retry same problem ──────────────────────────────────────────────── */

function retryRound() {
  if (_selectedProbId) launchInterview();
}

/* ── Send message from input box ────────────────────────────────────── */

function sendMsg() {
  const inp = document.getElementById('cinp');
  const text = inp?.value.trim() || '';
  if (!text) return;
  if (inp) inp.value = '';
  ROOM.sendMessage(text);
}

function onInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
}

/* ── End interview button ────────────────────────────────────────────── */

function endInterview() { ROOM.endInterview(); }

/* ── Feedback actions ────────────────────────────────────────────────── */

function exportFeedbackReport() {
  exportFeedback(ROOM.problem, ROOM.round);
}

/* ── Initialise on load ──────────────────────────────────────────────── */

window.addEventListener('DOMContentLoaded', () => {
  APP.showScreen('home');
  renderProblemGrid('DSA');   // default tab

  // Close edit modal on backdrop click
  const modal = document.getElementById('edit-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeEditModal();
    });
  }

  // Show API key modal on first run (no key stored yet)
  if (!localStorage.getItem('anthropic_api_key') && !window._ANTHROPIC_KEY) {
    showApiKeyModal();
  }
});
