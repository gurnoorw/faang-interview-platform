/**
 * feedback.js — Detailed post-interview feedback engine
 *
 * After the interview ends:
 *  1. Sends conversation history + code to Claude
 *  2. Receives structured JSON evaluation
 *  3. Renders a multi-section feedback report
 *  4. Supports export to .txt
 */

let _lastFeedback = null;  // cache for export

/* ── Generate feedback via Claude ─────────────────────────────────────── */

/**
 * @param {Object} opts
 * @param {string} opts.round       — DSA | HLD | LLD | BEH | AI
 * @param {Object} opts.problem     — problem object from QB
 * @param {Array}  opts.history     — conversation turns
 * @param {string} opts.code        — code editor content
 * @param {number} opts.timeUsedSec — seconds used
 * @param {number} opts.msgCount    — messages exchanged
 * @param {number} opts.submitCount — code submissions
 */
async function generateFeedback(opts) {
  const { round, problem, history, code, timeUsedSec, msgCount, submitCount } = opts;
  const timeMin = Math.round(timeUsedSec / 60);

  const recentConvo = history
    .slice(-10)
    .map(m => `${m.role}: ${m.content.substring(0, 200)}`)
    .join('\n');

  const prompt =
`You are evaluating a ${round} mock interview for an SDE-3 FAANG position.

Problem: ${problem.title} (${problem.difficulty || 'unrated'})
Round: ${round}
Time used: ${timeMin} of ${problem.timeMin || 45} minutes
Messages exchanged: ${msgCount}
Code submissions: ${submitCount}
${code.trim().length > 50
  ? `Code written (first 700 chars):\n${code.substring(0, 700)}`
  : 'No significant code was written.'}

Recent conversation:
${recentConvo}

Generate an EXHAUSTIVE, SPECIFIC feedback report. Every observation must reference actual candidate behaviour — no generic advice.

Return ONLY valid JSON (no markdown, no backticks):
{
  "overall": <0-100>,
  "verdict": "Strong Hire | Hire | Borderline | No Hire | Strong No Hire",
  "hiringSummary": "3-sentence honest hiring recommendation with specific reasons",
  "categories": [
    {
      "name": "Problem Solving",
      "score": <0-100>,
      "goods": ["specific strength from this session"],
      "improves": ["specific gap with example from their answers"],
      "critical": "THE single most important fix"
    },
    { "name": "Communication", "score": 0, "goods": [], "improves": [], "critical": "" },
    { "name": "Code / Design Quality", "score": 0, "goods": [], "improves": [], "critical": "" },
    { "name": "Depth Under Pressure", "score": 0, "goods": [], "improves": [], "critical": "" }
  ],
  "keyMoments": [
    { "type": "good", "title": "Strong moment title", "detail": "What they did and why it was good" },
    { "type": "bad",  "title": "Missed opportunity", "detail": "What they missed and what they should have done" },
    { "type": "tip",  "title": "Actionable tip",     "detail": "Concrete thing to practise before next interview" }
  ],
  "codeFeedback": {
    "approach":    "Was the algorithmic approach correct? What was right or wrong?",
    "complexity":  "Did they state and achieve the correct time/space complexity?",
    "edgeCases":   "Which edge cases handled? Which missed?",
    "codeStyle":   "Naming, structure, readability observations"
  },
  "communicationFeedback": {
    "thinkAloud":       "Did they verbalise reasoning before writing code?",
    "clarifyingQs":     "Did they ask clarifying questions before starting?",
    "structuredAnswer": "Was there a plan before implementation?",
    "underPressure":    "How did they handle follow-up challenges from the interviewer?"
  },
  "sde3Gap": "Honest: what specifically is missing for SDE-3 bar? If ready, say so explicitly.",
  "nextSteps": [
    "Specific actionable practice item 1",
    "Specific actionable practice item 2",
    "Specific actionable practice item 3"
  ]
}`;

  const raw = await callClaude(
    [{ role: 'user', content: prompt }],
    'You are a senior FAANG hiring committee member. Be honest, specific, and constructive. Return ONLY valid JSON.',
    1400
  );

  let fb;
  try {
    fb = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
  } catch (_) {
    // Fallback if JSON parse fails
    fb = _fallbackFeedback(round, problem);
  }

  _lastFeedback = fb;
  return fb;
}

/* ── Fallback feedback (parse failure safety net) ───────────────────── */

function _fallbackFeedback(round, problem) {
  return {
    overall: 60,
    verdict: 'Borderline',
    hiringSummary: `Attempted ${problem.title}. Performance was mixed. See categories for specifics.`,
    categories: [
      { name: 'Problem Solving',       score: 60, goods: ['Identified a working approach'], improves: ['Deepen edge-case coverage'], critical: 'Prove complexity claims verbally' },
      { name: 'Communication',         score: 55, goods: ['Answered follow-up questions'],  improves: ['Think aloud before coding'],  critical: 'Explain plan BEFORE writing code' },
      { name: 'Code / Design Quality', score: 60, goods: ['Basic structure present'],       improves: ['Handle null/boundary cases'],  critical: 'Defensive coding practices' },
      { name: 'Depth Under Pressure',  score: 50, goods: ['Stayed composed'],               improves: ['Defend design choices'],       critical: 'Answer follow-ups without crumbling' },
    ],
    keyMoments: [
      { type: 'tip', title: 'Top priority', detail: 'Practice thinking aloud — a silent candidate is invisible to the interviewer.' },
    ],
    codeFeedback: {
      approach: 'Insufficient data to evaluate fully.',
      complexity: 'Not demonstrated clearly.',
      edgeCases: 'Edge case coverage unclear.',
      codeStyle: 'Not enough code written to evaluate style.',
    },
    communicationFeedback: {
      thinkAloud: 'Needs improvement.',
      clarifyingQs: 'Unclear if clarifying questions were asked.',
      structuredAnswer: 'No clear plan before coding observed.',
      underPressure: 'Not sufficiently tested.',
    },
    sde3Gap: 'More depth needed in both approach explanation and handling of interviewer follow-ups.',
    nextSteps: [
      'Solve 5 LeetCode mediums narrating every thought aloud',
      'Do 2 mock interviews with a peer who challenges every claim',
      'Write Big-O analysis for every solution before coding',
    ],
  };
}

/* ── Render feedback report to #feedback screen ─────────────────────── */

function renderFeedback(fb, problem, round) {
  // Score ring
  const score = fb.overall || 60;
  document.getElementById('fb-n').textContent = score;
  const ring = document.getElementById('rp');
  if (ring) {
    ring.setAttribute('stroke-dashoffset', Math.round(251.2 - (score / 100) * 251.2));
    ring.setAttribute('stroke', score >= 75 ? '#22c55e' : score >= 55 ? '#f59e0b' : '#ef4444');
  }

  // Verdict
  const vicon = fb.verdict?.includes('Strong Hire') || fb.verdict === 'Hire' ? '✅'
              : fb.verdict?.includes('No Hire') ? '❌' : '🟡';
  document.getElementById('fb-round-lbl').textContent = `${problem.title} · ${round}`;
  document.getElementById('fb-verd').textContent      = `${vicon} ${fb.verdict}`;
  document.getElementById('fb-sum').textContent       = fb.hiringSummary || '';

  const body = document.getElementById('fb-body');
  body.innerHTML = '';

  // ── Score breakdown
  body.appendChild(_makeSection('ti-chart-bar', 'Score breakdown', _renderCategories(fb.categories)));

  // ── Key moments
  if (fb.keyMoments?.length) {
    body.appendChild(_makeSection('ti-flame', 'Key moments from this session', _renderMoments(fb.keyMoments)));
  }

  // ── Code / Design feedback
  if (fb.codeFeedback) {
    body.appendChild(_makeSection('ti-code', 'Code & algorithmic analysis', _renderQuotes(fb.codeFeedback, ['approach','complexity','edgeCases','codeStyle'], ['Approach','Complexity','Edge cases','Code style'])));
  }

  // ── Communication
  if (fb.communicationFeedback) {
    body.appendChild(_makeSection('ti-message', 'Communication breakdown', _renderQuotes(fb.communicationFeedback, ['thinkAloud','clarifyingQs','structuredAnswer','underPressure'], ['Think-aloud','Clarifying Qs','Answer structure','Under pressure'])));
  }

  // ── SDE-3 gap
  if (fb.sde3Gap) {
    const el = document.createElement('div');
    el.className = 'fb-moment tip-m';
    el.innerHTML = `<div class="fb-moment-label">Honest SDE-3 bar assessment</div>
      <div class="fb-moment-txt">${sanitise(fb.sde3Gap)}</div>`;
    body.appendChild(_makeSection('ti-target', 'SDE-3 bar assessment', el));
  }

  // ── Next steps
  if (fb.nextSteps?.length) {
    const ol = document.createElement('div');
    ol.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    fb.nextSteps.forEach((step, i) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid rgba(124,111,255,0.1)';
      d.innerHTML =
        `<span style="min-width:22px;height:22px;border-radius:50%;background:rgba(124,111,255,0.2);
          color:var(--acc2);display:flex;align-items:center;justify-content:center;
          font-size:0.62rem;font-weight:700;flex-shrink:0">${i + 1}</span>
         <span style="font-size:0.76rem;color:#ccc;line-height:1.5">${sanitise(step)}</span>`;
      ol.appendChild(d);
    });
    body.appendChild(_makeSection('ti-list-check', 'Action plan for next 2 weeks', ol));
  }
}

/* ── Section builders ────────────────────────────────────────────────── */

function _makeSection(icon, title, contentEl) {
  const sec = document.createElement('div');
  sec.className = 'fb-section';
  sec.innerHTML = `<div class="fb-sec-hdr">
    <i class="ti ${icon}" aria-hidden="true"></i>${sanitise(title)}
  </div>`;
  const body = document.createElement('div');
  body.className = 'fb-sec-body';
  if (contentEl instanceof Element) body.appendChild(contentEl);
  else body.innerHTML = contentEl;
  sec.appendChild(body);
  return sec;
}

function _renderCategories(cats) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem';
  (cats || []).forEach(cat => {
    const s  = cat.score || 60;
    const sc = s >= 75 ? '#22c55e' : s >= 55 ? '#f59e0b' : '#ef4444';
    const d  = document.createElement('div');
    d.className = 'fb-cat';
    d.innerHTML =
      `<div class="fb-cat-hdr">
        <div class="fb-cat-name">${sanitise(cat.name)}</div>
        <div class="fb-cat-score" style="color:${sc}">${s}/100</div>
      </div>
      <div class="fb-cat-bar"><div class="fb-cat-fill" style="width:${s}%;background:${sc}"></div></div>
      <div class="fb-cat-items">
        ${(cat.goods    || []).map(g => `<div class="fb-item g">${sanitise(g)}</div>`).join('')}
        ${(cat.improves || []).map(i => `<div class="fb-item i">${sanitise(i)}</div>`).join('')}
        ${cat.critical  ? `<div class="fb-item b">Critical: ${sanitise(cat.critical)}</div>` : ''}
      </div>`;
    wrap.appendChild(d);
  });
  return wrap;
}

function _renderMoments(moments) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  moments.forEach(m => {
    const d = document.createElement('div');
    d.className = `fb-moment ${m.type === 'good' ? 'good-m' : m.type === 'bad' ? 'bad-m' : 'tip-m'}`;
    const lbl = m.type === 'good' ? 'What you did well' : m.type === 'bad' ? 'What you missed' : 'Pro tip';
    d.innerHTML =
      `<div class="fb-moment-label">${lbl}</div>
       <div class="fb-moment-txt"><strong>${sanitise(m.title || '')}</strong> — ${sanitise(m.detail || '')}</div>`;
    wrap.appendChild(d);
  });
  return wrap;
}

function _renderQuotes(obj, keys, labels) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  keys.forEach((k, i) => {
    if (!obj[k]) return;
    const d = document.createElement('div');
    d.className = 'fb-quote';
    d.innerHTML =
      `<div class="fb-quote-ctx">${labels[i]}</div>
       <div class="fb-quote-txt">${sanitise(obj[k])}</div>`;
    wrap.appendChild(d);
  });
  return wrap;
}

/* ── Export ──────────────────────────────────────────────────────────── */

function exportFeedback(problem, round) {
  const fb = _lastFeedback;
  if (!fb) return;

  const lines = [
    'FAANG MOCK INTERVIEW REPORT',
    '='.repeat(50),
    `Problem : ${problem.title}`,
    `Round   : ${round}`,
    `Verdict : ${fb.verdict}`,
    `Score   : ${fb.overall}/100`,
    '',
    fb.hiringSummary || '',
    '',
    'SCORE BREAKDOWN',
    '-'.repeat(30),
    ...(fb.categories || []).map(c =>
      `  ${c.name}: ${c.score}/100\n` +
      (c.goods    || []).map(g => `    + ${g}`).join('\n') + '\n' +
      (c.improves || []).map(i => `    ↗ ${i}`).join('\n') + '\n' +
      (c.critical ? `    ✗ Critical: ${c.critical}` : '')
    ),
    '',
    'SDE-3 ASSESSMENT',
    '-'.repeat(30),
    fb.sde3Gap || '',
    '',
    'ACTION PLAN',
    '-'.repeat(30),
    ...(fb.nextSteps || []).map((s, i) => `  ${i + 1}. ${s}`),
    '',
    `Generated: ${new Date().toLocaleString('en-IN')}`,
    'Note: session data only — nothing is stored beyond this local file.',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `interview_${round}_${Date.now()}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
