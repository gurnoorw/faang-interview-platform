/**
 * editor.js — Code editor, live code review, and submission handling
 *
 * The code editor is a plain <textarea> with a line-number gutter overlay.
 * No heavy dependencies — keeps the platform fast and offline-capable.
 *
 * Submodules (all in this file):
 *  - LineNumbers:   syncs a gutter div with textarea content
 *  - LanguagePicker: swaps starter code templates on language change
 *  - CodeWatcher:   fires live code review every CONFIG.TIMERS.CODE_WATCH_MS
 *  - RunSimulator:  simulates code execution via Claude
 *  - Submitter:     analyses submitted code and triggers interviewer reaction
 */

// ── Editor state ──────────────────────────────────────────────────────────
let _lastCodeSnapshot = '';  // Last code sent for review (diff check)

// ── Line numbers ──────────────────────────────────────────────────────────

/**
 * updateLineNumbers — Regenerate the line-number gutter to match textarea content.
 * Called on every keystroke via oninput.
 */
function updateLineNumbers() {
  const editor = document.getElementById('ced');
  const gutter = document.getElementById('lns');
  if (!editor || !gutter) return;

  const lineCount = editor.value.split('\n').length;
  gutter.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
}

/** Sync gutter scroll position with textarea scroll */
function syncGutterScroll() {
  const editor = document.getElementById('ced');
  const gutter = document.getElementById('lns');
  if (editor && gutter) gutter.scrollTop = editor.scrollTop;
}

// ── Starter code templates ─────────────────────────────────────────────────

/**
 * setEditorCode — Populate the editor with a code string and refresh gutter.
 * @param {string} code
 */
function setEditorCode(code) {
  const editor = document.getElementById('ced');
  if (editor) {
    editor.value = code || '';
    updateLineNumbers();
  }
}

/**
 * onLanguageChange — Swap the starter template when user picks a new language.
 * Warns if the editor has non-starter content (to avoid wiping work).
 */
function onLanguageChange() {
  const lang     = document.getElementById('lsel')?.value;
  const prob     = getCurrentProblem(); // defined in room.js
  if (!prob?.starterCode) return;

  const template = prob.starterCode[lang] || prob.starterCode.python || '';
  const current  = document.getElementById('ced')?.value?.trim() || '';

  // Only swap if editor still looks like a starter template (short and uncommented)
  const isMostlyStarter = current.split('\n').filter(l => l.trim() && !l.startsWith('#')).length < 10;
  if (!current || isMostlyStarter) {
    setEditorCode(template);
  } else {
    if (confirm('Switching language will replace your code. Continue?')) {
      setEditorCode(template);
    }
  }
}

// ── Live code watcher ─────────────────────────────────────────────────────

let _watchInterval = null;

/** Start the live code review loop */
function startCodeWatcher() {
  clearInterval(_watchInterval);
  _watchInterval = setInterval(_doCodeReview, CONFIG.TIMERS.CODE_WATCH_MS);
}

/** Stop the live code review loop */
function stopCodeWatcher() {
  clearInterval(_watchInterval);
  _watchInterval = null;
}

/**
 * _doCodeReview — Compare current code against last snapshot.
 * If meaningfully different, ask Claude for a live review.
 * Only fires if the code is non-trivial (> 80 chars) to avoid noisy feedback.
 */
async function _doCodeReview() {
  const code = document.getElementById('ced')?.value?.trim() || '';
  const prob = getCurrentProblem();

  if (!code || code === _lastCodeSnapshot || code.length < 80 || !prob) return;
  if (isInterviewerBusy() || isCallPending()) return;  // respect rate limiting

  _lastCodeSnapshot = code;
  setInterviewerStatus('s-think', 'Reviewing your code...');

  const prompt = `The candidate is solving "${prob.title}". Here is their current code:

\`\`\`
${code.substring(0, 700)}
\`\`\`

Do a LIVE code review — focus on the most important 2-3 observations right now.
Return ONLY valid JSON, no markdown:
{"items":[{"type":"crit|warn|good|info","text":"specific observation about this code"}]}

Types: "crit" = blocking bug or wrong approach, "warn" = correctness risk, "good" = correct insight, "info" = style/naming.`;

  const raw = await claudeChat(
    [{ role: 'user', content: prompt }],
    `FAANG interviewer doing live code review for "${prob.title}". Be terse and specific. Return ONLY JSON.`,
    CONFIG.API.TOKENS.CODE_WATCH
  );

  setInterviewerStatus('s-watch', 'Watching your approach...');
  if (!raw) return;

  try {
    const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
    renderCodeReviewStrip(data.items || []);

    // If there's a critical bug, interrupt the candidate in chat
    const crits = (data.items || []).filter(i => i.type === 'crit');
    if (crits.length > 0 && !isInterviewerBusy()) {
      triggerInterviewerInterrupt(
        `Hold on — I see a problem in your code: ${crits[0].text}. Address that before continuing.`,
        'int'
      );
    }
  } catch (e) {
    console.warn('[Editor] Code review JSON parse failed:', e);
  }
}

/**
 * renderCodeReviewStrip — Display live review items in the CR strip below the editor.
 * @param {Array<{type:string, text:string}>} items
 */
function renderCodeReviewStrip(items) {
  const container = document.getElementById('cri-wrap');
  if (!container) return;
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<div style="font-size:0.7rem;color:var(--mut);padding:3px">No issues found yet.</div>';
    return;
  }

  items.forEach(item => {
    const div  = document.createElement('div');
    div.className = `cri ${item.type || 'info'}`;

    const icon = document.createElement('span');
    icon.className = 'criico';
    icon.textContent = item.type === 'crit' ? '✗' : item.type === 'warn' ? '⚠' : item.type === 'good' ? '✓' : '→';

    const text = document.createElement('span');
    text.textContent = item.text; // textContent — no XSS risk

    div.appendChild(icon);
    div.appendChild(text);
    container.appendChild(div);
  });
}

// ── Code runner (simulated) ───────────────────────────────────────────────

/**
 * runCode — Simulate running the code and show output in the console strip.
 * Uses Claude to generate realistic simulated output (not an actual sandbox).
 */
async function runCode() {
  const code = document.getElementById('ced')?.value || '';
  const lang = document.getElementById('lsel')?.value || 'python';
  const prob = getCurrentProblem();
  const out  = document.getElementById('otxt');

  if (!out) return;
  out.style.color = '#888';
  out.textContent  = '$ Running...';

  // Small delay for UX feedback
  await new Promise(r => setTimeout(r, 200));

  const r = await claudeChat(
    [{
      role: 'user',
      content: `Simulate running this ${lang} code for the problem "${prob?.title || 'unknown'}". ` +
               `Show realistic console output (3-5 lines). If there's a bug, show the error.\n\n${code.substring(0, 500)}`,
    }],
    'Code execution simulator. Produce brief, realistic terminal output only. No markdown.',
    CONFIG.API.TOKENS.EVAL
  );

  out.style.color  = r ? '#aaffaa' : '#888';
  out.textContent  = r ? `$ ${r}` : '$ (add test cases to see output)';
}

// ── Code submission ───────────────────────────────────────────────────────

let _submitCount = 0;

/**
 * submitCode — Send the current code for interviewer evaluation.
 * The interviewer will either:
 *   a) Identify a bug and ask the candidate to fix it, or
 *   b) Accept the solution and pose a follow-up challenge.
 */
async function submitCode() {
  const code = document.getElementById('ced')?.value || '';
  const lang = document.getElementById('lsel')?.value || 'python';
  const prob = getCurrentProblem();

  if (!prob) return;
  _submitCount++;

  showLoadingOverlay('Analysing your solution...');

  const prompt =
    `The candidate just submitted this ${lang} solution for "${prob.title}" (submission #${_submitCount}):\n\n` +
    `\`\`\`${lang}\n${code}\n\`\`\`\n\n` +
    `As their FAANG interviewer:\n` +
    `- If there's a bug: point it out specifically ("Line N: your cache doesn't handle...")\n` +
    `- If correct but naive: acknowledge and pose a harder follow-up\n` +
    `- If optimal: say so and ask them to prove time/space complexity\n` +
    `Keep reply to 2-3 sentences.`;

  const reply = await claudeChat(
    [...getConversationHistory(), { role: 'user', content: '[Candidate submitted code]' }],
    prob.systemPrompt,
    CONFIG.API.TOKENS.SUBMISSION
  );

  hideLoadingOverlay();

  if (reply) {
    appendToHistory('user',      '[Candidate submitted code for review]');
    appendToHistory('assistant', reply);
    addChatMessage(reply, 'iv', getInterviewerName(), classifyMessage(reply));

    // Update code quality score on submit
    updateLiveScore('cq', Math.min(88, 45 + _submitCount * 14 + Math.round(Math.random() * 12)));
    increasePressure(CONFIG.PRESSURE.PER_SUBMISSION);

    // Show interviewer annotations on the problem pane after first submit
    if (_submitCount === 1 && prob.testCases?.length) {
      showInterviewerAnnotations(prob.testCases.map(tc => `Test: ${tc.input} → expected ${tc.expected}`));
    }
  }
}

/** Reset submit counter (called on new interview) */
function resetSubmitCount() { _submitCount = 0; _lastCodeSnapshot = ''; }
