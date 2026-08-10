/**
 * interviewer.js — Interviewer Mode: Question Bank Manager
 *
 * Sections:
 *  1. DSA  — Add LeetCode URL (auto-parse) OR custom question with test cases
 *  2. HLD  — Add design question with title, description, expected coverage bullets
 *  3. LLD  — Same as HLD with optional class design checklist
 *  4. BEH  — Add/modify behavioural questions with probes and STAR signals
 *  5. AI   — Add knowledge topics with subtopics and per-level descriptions
 *
 * All changes persist via QB (questions.js → localStorage).
 */

/* ── Tab switching ────────────────────────────────────────────────────── */

function ivTabSwitch(tabName, btn) {
  // Update active tab button
  document.querySelectorAll('.iv-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Show correct panel
  document.querySelectorAll('.iv-panel').forEach(p => { p.style.display = 'none'; });
  const panel = document.getElementById(`iv-panel-${tabName}`);
  if (panel) panel.style.display = 'flex';

  // Re-render the question list for this tab
  renderQList(tabName.toUpperCase());
}

/* ── Render question list ─────────────────────────────────────────────── */

function renderQList(round) {
  const container = document.getElementById(`qlist-${round}`);
  if (!container) return;

  const questions = QB.get(round);
  container.innerHTML = '';

  if (questions.length === 0) {
    container.innerHTML = '<div style="color:var(--mut);font-size:0.75rem;padding:8px">No questions yet — add one below.</div>';
    return;
  }

  questions.forEach(q => {
    const card = document.createElement('div');
    card.className = 'iv-q-card';

    const header = document.createElement('div');
    header.className = 'iv-q-header';

    const title = document.createElement('span');
    title.className = 'iv-q-title';
    title.textContent = q.title || q.question || '(untitled)';

    const actions = document.createElement('div');
    actions.className = 'iv-q-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'iv-q-btn';
    editBtn.innerHTML = '<i class="ti ti-edit" aria-hidden="true"></i>';
    editBtn.title = 'Edit question';
    editBtn.onclick = () => openEditModal(round, q.id);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'iv-q-btn danger';
    delBtn.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    delBtn.title = 'Delete question';
    delBtn.onclick = () => {
      if (confirm(`Delete "${q.title || q.question}"? This cannot be undone.`)) {
        QB.remove(q.id);
        renderQList(round);
      }
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    header.appendChild(title);
    header.appendChild(actions);
    card.appendChild(header);

    // Sub-info (difficulty, topic, source)
    const meta = [];
    if (q.difficulty) meta.push(q.difficulty);
    if (q.topic)      meta.push(q.topic);
    if (q.source)     meta.push(q.source);
    if (meta.length) {
      const sub = document.createElement('div');
      sub.className = 'iv-q-meta';
      sub.textContent = meta.join(' · ');
      card.appendChild(sub);
    }

    container.appendChild(card);
  });
}

/* ── DSA: Add LeetCode URL ────────────────────────────────────────────── */

async function importLeetcodeUrl() {
  const urlEl  = document.getElementById('lc-url');
  const textEl = document.getElementById('lc-paste');
  const url    = (urlEl?.value || '').trim();
  const text   = (textEl?.value || '').trim();

  if (!url) { alert('Please enter the LeetCode problem URL.'); return; }
  if (!text) { alert('Please paste the problem description from LeetCode.'); return; }

  const q = QB.parseLeetcode(url, text);

  // Let the user set difficulty before saving
  const diff = document.getElementById('lc-difficulty')?.value || 'medium';
  const time  = parseInt(document.getElementById('lc-time')?.value, 10) || 45;
  q.difficulty = diff;
  q.timeMin    = time;

  QB.add('DSA', q);
  renderQList('DSA');
  showToast('LeetCode problem imported!');

  // Clear form
  if (urlEl)  urlEl.value  = '';
  if (textEl) textEl.value = '';
}

/* ── DSA: Add custom question with test cases ─────────────────────────── */

function addCustomDSA() {
  const title  = document.getElementById('cdsa-title')?.value.trim();
  const desc   = document.getElementById('cdsa-desc')?.value.trim();
  const diff   = document.getElementById('cdsa-diff')?.value || 'medium';
  const topic  = document.getElementById('cdsa-topic')?.value.trim() || 'Custom';
  const time   = parseInt(document.getElementById('cdsa-time')?.value, 10) || 45;
  const tcRaw  = document.getElementById('cdsa-tests')?.value.trim() || '';
  const sp     = document.getElementById('cdsa-sys')?.value.trim() || '';

  if (!title || !desc) { alert('Title and description are required.'); return; }

  // Parse test cases: each line → "input | expected"
  const testCases = tcRaw.split('\n')
    .filter(l => l.includes('|'))
    .map(l => {
      const [input, expected] = l.split('|').map(s => s.trim());
      return { input, expected };
    });

  QB.add('DSA', {
    title, description: desc, difficulty: diff, topic, timeMin: time,
    testCases,
    examples: [],
    constraints: [],
    starterCode: {
      python: '# Write your solution here\npass',
      java:   '// Write your solution here',
      cpp:    '// Write your solution here',
      javascript: '// Write your solution here',
    },
    systemPrompt: sp ||
      `You are a FAANG SDE-3 interviewer. The candidate is solving: "${title}". ` +
      `Probe for complexity, edge cases, and alternative approaches. Keep replies 1-3 sentences.`,
  });

  renderQList('DSA');
  showToast('Custom DSA question added!');
  _clearForm(['cdsa-title','cdsa-desc','cdsa-topic','cdsa-tests','cdsa-sys']);
}

/* ── Design (HLD / LLD): Add on-the-fly ─────────────────────────────── */

function addDesignQuestion(round) {
  const prefix = round.toLowerCase();
  const title   = document.getElementById(`${prefix}-title`)?.value.trim();
  const desc    = document.getElementById(`${prefix}-desc`)?.value.trim();
  const diff    = document.getElementById(`${prefix}-diff`)?.value || 'medium';
  const time    = parseInt(document.getElementById(`${prefix}-time`)?.value, 10) || 55;
  const covRaw  = document.getElementById(`${prefix}-coverage`)?.value.trim() || '';
  const nfrRaw  = document.getElementById(`${prefix}-nfrs`)?.value.trim() || '';
  const wb      = document.getElementById(`${prefix}-whiteboard`)?.checked ?? true;
  const sp      = document.getElementById(`${prefix}-sys`)?.value.trim() || '';

  if (!title || !desc) { alert('Title and description are required.'); return; }

  const expectedCoverage = covRaw.split('\n').map(l => l.trim()).filter(Boolean);
  const nfrs             = nfrRaw.split('\n').map(l => l.trim()).filter(Boolean);

  QB.add(round, {
    title, description: desc, difficulty: diff, timeMin: time,
    expectedCoverage, nfrs, hasWhiteboard: wb,
    systemPrompt: sp ||
      `You are a FAANG Staff Engineer interviewing an SDE-3 candidate. Problem: "${title}". ` +
      `Evaluate like a real FAANG interviewer: push for numbers first (back-of-envelope), ` +
      `probe every design decision ("why not X instead?"), identify single points of failure, ` +
      `and ask about trade-offs. Keep replies 1-3 sentences.`,
  });

  renderQList(round);
  showToast(`${round} question added!`);
  _clearForm([`${prefix}-title`,`${prefix}-desc`,`${prefix}-coverage`,`${prefix}-nfrs`,`${prefix}-sys`]);
}

/* ── BEH: Add / edit ────────────────────────────────────────────────── */

function addBehQuestion() {
  const question = document.getElementById('beh-question')?.value.trim();
  const title    = document.getElementById('beh-title')?.value.trim() || question?.substring(0, 40) || 'Behavioural';
  const probeRaw = document.getElementById('beh-probes')?.value.trim() || '';
  const sigRaw   = document.getElementById('beh-signals')?.value.trim() || '';
  const sp       = document.getElementById('beh-sys')?.value.trim() || '';

  if (!question) { alert('Question text is required.'); return; }

  const probes  = probeRaw.split('\n').map(l => l.trim()).filter(Boolean);
  const signals = sigRaw.split('\n').map(l => l.trim()).filter(Boolean);

  QB.add('BEH', {
    title,
    question,
    probes,
    signals,
    systemPrompt: sp ||
      `You are a FAANG EM running a behavioural interview for SDE-3. ` +
      `Question: "${question}". ` +
      `Probe STAR deeply: push for specifics ("what did YOU do?"), numbers ("by how much?"), ` +
      `and difficulty ("where was the real challenge?"). Keep replies 1-3 sentences.`,
  });

  renderQList('BEH');
  showToast('Behavioural question added!');
  _clearForm(['beh-title','beh-question','beh-probes','beh-signals','beh-sys']);
}

/* ── AI: Add topic ────────────────────────────────────────────────────── */

function addAITopic() {
  const title    = document.getElementById('ai-topic-title')?.value.trim();
  const subRaw   = document.getElementById('ai-subtopics')?.value.trim() || '';

  if (!title) { alert('Topic title is required.'); return; }

  const subtopics = subRaw.split('\n').map(l => l.trim()).filter(Boolean);

  QB.add('AI', {
    title,
    subtopics,
    difficultyLevels: {
      1: `Basic definitions and intuition about ${title}`,
      2: `Mechanical understanding of how ${title} works`,
      3: `Trade-offs and design choices in ${title}`,
      4: `Edge cases and failure modes in ${title}`,
      5: `System design application of ${title} at scale`,
    },
  });

  renderQList('AI');
  showToast('AI topic added!');
  _clearForm(['ai-topic-title','ai-subtopics']);
}

/* ── Edit modal ──────────────────────────────────────────────────────── */

function openEditModal(round, id) {
  const q = QB.get(round).find(x => x.id === id);
  if (!q) return;

  const modal  = document.getElementById('edit-modal');
  const fields = document.getElementById('edit-fields');
  fields.innerHTML = '';
  modal.style.display = 'flex';
  modal.dataset.id = id;

  // Build edit fields based on round type
  const editableFields = round === 'BEH'
    ? [['question','Question',q.question||'','textarea'],['title','Title',q.title||'','text']]
    : [['title','Title',q.title||'','text'],['description','Description (can be long)',q.description||'','textarea']];

  if (round === 'DSA') {
    editableFields.push(['difficulty','Difficulty',q.difficulty||'medium','select:easy,medium,hard']);
    editableFields.push(['systemPrompt','AI System Prompt',q.systemPrompt||'','textarea']);
  }
  if (round === 'HLD' || round === 'LLD') {
    editableFields.push(['systemPrompt','AI System Prompt (defines interviewer behaviour)',q.systemPrompt||'','textarea']);
  }
  if (round === 'BEH') {
    editableFields.push(['systemPrompt','AI System Prompt',q.systemPrompt||'','textarea']);
  }

  editableFields.forEach(([key, label, val, type]) => {
    const wrap  = document.createElement('div');
    wrap.className = 'edit-field';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.htmlFor = `ef-${key}`;
    wrap.appendChild(lbl);

    let input;
    if (type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = key === 'systemPrompt' ? 6 : key === 'description' ? 5 : 3;
      input.value = val;
    } else if (type.startsWith('select:')) {
      input = document.createElement('select');
      type.substring(7).split(',').forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (opt === val) o.selected = true;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type  = 'text';
      input.value = val;
    }
    input.id = `ef-${key}`;
    input.dataset.fieldKey = key;
    wrap.appendChild(input);
    fields.appendChild(wrap);
  });
}

function saveEdit() {
  const modal  = document.getElementById('edit-modal');
  const id     = modal.dataset.id;
  const inputs = modal.querySelectorAll('[data-field-key]');
  const patch  = {};
  inputs.forEach(inp => { patch[inp.dataset.fieldKey] = inp.value; });
  QB.update(id, patch);

  closeEditModal();
  // Refresh all lists
  ['DSA','HLD','LLD','BEH','AI'].forEach(renderQList);
  showToast('Question updated!');
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  if (modal) modal.style.display = 'none';
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function _clearForm(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 2500);
}

/** Call once on DOMContentLoaded to pre-populate all question lists. */
function initInterviewerMode() {
  ['DSA','HLD','LLD','BEH','AI'].forEach(renderQList);
}
