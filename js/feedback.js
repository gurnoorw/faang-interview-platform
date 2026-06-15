/**
 * feedback.js — Comprehensive post-interview feedback engine
 *
 * Rubric coverage (round-specific):
 *   DSA  — Algorithm, Problem Understanding, Code Quality, Complexity, Edge Cases, Communication, Adaptability
 *   HLD  — Requirements & Estimation, Architecture, Data Modeling, Scalability & Reliability, Trade-offs, Communication
 *   LLD  — OOP & SOLID, Design Patterns, Concurrency Safety, Code Quality, Extensibility, Communication
 *   BEH  — STAR Structure, Impact Scope, SDE-3 Ownership, Leadership Alignment, Self-Awareness
 *   AI   — Conceptual Foundation, Mathematical Depth, Practical Application, ML System Design, Communication
 *
 * Also evaluates: Communication Log (from COMM_TRACKER objective data)
 */

let _lastFeedback = null;

/* ═══════════════════════════════════════════════════════════════════════
   RUBRIC DEFINITIONS (per round)
═══════════════════════════════════════════════════════════════════════ */

function _getRubrics(round) {
  const base = {
    DSA: [
      { name: 'Problem Understanding & Clarification', weight: 'high',
        probe: 'Did they ask about constraints (size, value range, duplicates, nulls)? Did they restate the problem? Did they clarify before coding?' },
      { name: 'Algorithm Selection & Intuition', weight: 'high',
        probe: 'Did they identify the optimal algorithm? Did they consider brute force → optimisation? Did they explain WHY this approach?' },
      { name: 'Complexity Analysis', weight: 'high',
        probe: 'Did they state and prove time AND space complexity? Did they account for all loops and recursion? Were claims correct?' },
      { name: 'Code Quality & Implementation', weight: 'high',
        probe: 'Is the code clean, readable, correctly named? Are functions modular? Does it handle the core case correctly?' },
      { name: 'Edge Case Mastery', weight: 'medium',
        probe: 'Did they handle: empty input, single element, duplicates, negative numbers, overflow, null? Were they proactive or reactive?' },
      { name: 'Think-Aloud & Communication', weight: 'medium',
        probe: 'Did they verbalise reasoning before and during coding? Were explanations structured? Did they explain design choices?' },
      { name: 'Adaptability Under Pressure', weight: 'medium',
        probe: 'How did they respond to hints, challenges, and corrections? Did they defend positions with logic or capitulate blindly?' },
    ],
    HLD: [
      { name: 'Requirements & Scale Estimation', weight: 'high',
        probe: 'Did they clarify scope, in/out of scope, user count, RPS? Did they do back-of-envelope math before drawing architecture? Numbers correct?' },
      { name: 'System Architecture', weight: 'high',
        probe: 'Did they cover all major components (API gateway, services, DB, cache, CDN, queue)? Is the architecture coherent and realistic?' },
      { name: 'Data Modeling & API Design', weight: 'high',
        probe: 'Was the DB schema appropriate? SQL vs NoSQL justified? Were API endpoints defined clearly (REST/gRPC, payload, status codes)?' },
      { name: 'Scalability & Performance', weight: 'high',
        probe: 'Did they address horizontal scaling, sharding, replication, caching strategy (Redis, CDN), read/write separation?' },
      { name: 'Reliability & Fault Tolerance', weight: 'medium',
        probe: 'Did they identify SPOFs? Multi-AZ, replication factor, failover strategy, circuit breakers, retry with backoff?' },
      { name: 'Trade-off Articulation', weight: 'medium',
        probe: 'Did they explicitly state trade-offs (consistency vs availability, latency vs cost, SQL vs NoSQL)? Did they justify choices?' },
      { name: 'Communication & Structure', weight: 'medium',
        probe: 'Did they present a clear approach: estimation → API → data model → high-level → deep dives? Did they drive the conversation?' },
    ],
    LLD: [
      { name: 'OOP Fundamentals & SOLID Principles', weight: 'high',
        probe: 'Single Responsibility? Open/Closed (new feature = zero changes to existing)? Liskov, Interface Segregation, Dependency Inversion demonstrated?' },
      { name: 'Design Patterns', weight: 'high',
        probe: 'Did they apply the right patterns (Strategy, Observer, Factory, State Machine, etc.)? Were patterns justified, not just named?' },
      { name: 'Class Structure & Abstraction', weight: 'high',
        probe: 'Right level of abstraction? Did they avoid god classes? Is inheritance justified (IS-A vs HAS-A)? Clean interface design?' },
      { name: 'Concurrency & Thread Safety', weight: 'high',
        probe: 'Did they identify race conditions? Were locks/synchronized used correctly and at the right granularity? Deadlock risk?' },
      { name: 'Extensibility & Testability', weight: 'medium',
        probe: 'Adding a new requirement — how many classes change? Are classes testable in isolation (no hidden dependencies)?' },
      { name: 'Code Quality', weight: 'medium',
        probe: 'Naming, method length, error handling, defensive coding, null safety. Would this code pass a PR review?' },
      { name: 'Communication & Approach', weight: 'medium',
        probe: 'Did they talk through requirements, identify entities, clarify scope before coding? Or did they jump straight to code?' },
    ],
    BEH: [
      { name: 'STAR Structure & Specificity', weight: 'high',
        probe: 'Was Situation, Task, Action, Result each present and specific? Or was it vague and abstract? Did they name real projects, real metrics?' },
      { name: 'Impact Scope & Scale', weight: 'high',
        probe: 'Was the impact individual, team, or org-wide? SDE-3 should show cross-team or org-level impact. Did they quantify with numbers?' },
      { name: 'SDE-3 Ownership Signals', weight: 'high',
        probe: 'Did they take ownership proactively? Did they drive resolution vs escalating? Did they handle ambiguity independently?' },
      { name: 'Leadership Principles Alignment', weight: 'medium',
        probe: 'Which LPs were demonstrated (Ownership, Dive Deep, Disagree & Commit, Invent & Simplify, Earn Trust)? Were they authentic or rehearsed?' },
      { name: 'Handling Adversity & Failure', weight: 'medium',
        probe: 'How did they handle setbacks? Did they blame circumstances or take accountability? Was their learning genuine and systematic?' },
      { name: 'Communication Maturity', weight: 'medium',
        probe: 'Concise but complete? Did they answer the question asked? Did they handle probing follow-ups without getting defensive?' },
    ],
    AI: [
      { name: 'Conceptual Foundation', weight: 'high',
        probe: 'Core definitions correct and precise? Could they distinguish related concepts (supervised vs unsupervised, CNN vs RNN, etc.)?' },
      { name: 'Mathematical Depth', weight: 'high',
        probe: 'Could they write loss functions, derive gradients, explain the math behind attention, backprop chain rule? Or just high-level intuition?' },
      { name: 'Practical ML Knowledge', weight: 'high',
        probe: 'Real-world considerations: data leakage, train/val/test splits, feature scaling, class imbalance, model drift, deployment constraints?' },
      { name: 'ML System Design', weight: 'high',
        probe: 'Could they design an end-to-end ML pipeline? Feature store, model serving, A/B testing, monitoring, retraining triggers?' },
      { name: 'Communication & Teaching Clarity', weight: 'medium',
        probe: 'Could they explain complex concepts clearly? Did they use good analogies? Would a non-ML engineer understand their explanation?' },
    ],
  };
  return base[round] || base.DSA;
}

/* ═══════════════════════════════════════════════════════════════════════
   GENERATE FEEDBACK — main entry point
═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} opts
 * @param {string} opts.round
 * @param {Object} opts.problem
 * @param {Array}  opts.history
 * @param {string} opts.code
 * @param {number} opts.timeUsedSec
 * @param {number} opts.msgCount
 * @param {number} opts.submitCount
 * @param {string} opts.commNotes   — from COMM_TRACKER.getSummary()
 */
async function generateFeedback(opts) {
  const { round, problem, history, code, timeUsedSec, msgCount, submitCount, commNotes } = opts;
  const timeMin = Math.round(timeUsedSec / 60);
  const rubrics = _getRubrics(round);

  // Include up to 18 most recent conversation turns for context
  const recentConvo = history
    .slice(-18)
    .map(m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${m.content.substring(0, 300)}`)
    .join('\n\n');

  const rubricsText = rubrics.map((r, i) =>
    `${i + 1}. "${r.name}" [weight: ${r.weight}]\n   Evaluate: ${r.probe}`
  ).join('\n');

  const codeSection = code.trim().length > 40
    ? `Code written (first 900 chars):\n\`\`\`\n${code.substring(0, 900)}\n\`\`\``
    : 'No significant code was written during this session.';

  const prompt =
`You are a senior FAANG hiring committee evaluator writing a post-interview debrief for an SDE-3 candidate.
Be forensically honest. Reference specific moments from the conversation — no generic advice.

=== SESSION FACTS ===
Problem     : ${problem.title} (${problem.difficulty || 'unrated'})
Round type  : ${round}
Time used   : ${timeMin} / ${problem.timeMin || 45} min
Messages    : ${msgCount}
Submissions : ${submitCount}

${codeSection}

=== CONVERSATION TRANSCRIPT (most recent ${Math.min(history.length, 18)} turns) ===
${recentConvo || '(No conversation recorded)'}

${commNotes || ''}

=== EVALUATION RUBRICS FOR THIS ${round} ROUND ===
${rubricsText}

=== YOUR TASK ===
Return ONLY valid JSON — no markdown fences, no commentary outside the JSON.

{
  "overall": <0-100 integer>,
  "verdict": "Strong Hire | Hire | Borderline | No Hire | Strong No Hire",
  "hiringSummary": "3 sentences: honest hiring recommendation with specific evidence from this session",
  "categories": [
    {
      "name": "<rubric name — use exact rubric names above>",
      "score": <0-100>,
      "goods":    ["specific strength with example from their actual words/code"],
      "improves": ["specific gap with example of what they said vs what they should have said"],
      "critical": "THE single most impactful improvement for this dimension"
    }
  ],
  "communicationAnalysis": {
    "thinkAloud":          "Did they verbalise reasoning before coding? Specific moments.",
    "clarifyingQuestions": "Quality and timing of clarifying questions asked.",
    "structureAndPacing":  "Was their presentation organised? Did they drive the session?",
    "fillerWords":         "Assessment of verbal fluency based on the comm notes above.",
    "underPressure":       "How did they handle interviewer challenges and follow-ups?"
  },
  "keyMoments": [
    { "type": "good", "title": "Short title", "detail": "What they did and why it was impressive at SDE-3 bar" },
    { "type": "bad",  "title": "Short title", "detail": "Specific missed opportunity with what they should have done instead" },
    { "type": "tip",  "title": "Short title", "detail": "Highest-leverage practice action to fix the biggest gap" }
  ],
  "codeOrDesignFeedback": {
    "approach":    "Algorithmic/design approach assessment — correct? optimal? explained?",
    "execution":   "Implementation quality — what was built, what was missing?",
    "edgeCases":   "Edge cases handled vs missed (specific examples)",
    "complexity":  "Complexity analysis — stated? correct? space considered?"
  },
  "sde3Assessment": {
    "currentLevel": "Honest estimate: SDE-2 / Borderline SDE-3 / SDE-3 / Above SDE-3 bar",
    "gaps":         "What specific capabilities are missing for SDE-3?",
    "strengths":    "What SDE-3 signals were demonstrated?",
    "timeline":     "Realistic estimate: how long to close gaps with focused practice?"
  },
  "nextSteps": [
    "Highest-priority specific practice item with resource or exercise",
    "Second-priority item",
    "Third-priority item"
  ]
}`;

  // Wait for any in-flight API call to finish before generating feedback
  // (prevents rate-limit null on final call)
  let raw = null;
  let attempts = 0;
  while (!raw && attempts < 5) {
    raw = await callClaude(
      [{ role: 'user', content: prompt }],
      'Senior FAANG hiring committee member. Be forensically honest and specific. Return ONLY valid JSON.',
      2800
    );
    if (!raw) {
      attempts++;
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  let fb;
  try {
    fb = JSON.parse((raw || '').replace(/^```json\s*|^```\s*|```\s*$/gm, '').trim());
  } catch (_) {
    fb = _fallbackFeedback(round, problem);
  }

  _lastFeedback = fb;
  return fb;
}

/* ── Fallback (parse failure) ─────────────────────────────────────────── */

function _fallbackFeedback(round, problem) {
  const rubrics = _getRubrics(round);
  return {
    overall: 60,
    verdict: 'Borderline',
    hiringSummary: `Attempted ${problem.title}. Insufficient conversation data to generate a detailed assessment. Try having a longer session.`,
    categories: rubrics.map(r => ({
      name: r.name, score: 60,
      goods: ['Session data insufficient for specific analysis'],
      improves: ['More conversation needed for detailed evaluation'],
      critical: 'Engage more actively with the interviewer during the session',
    })),
    communicationAnalysis: {
      thinkAloud:          'Insufficient data.',
      clarifyingQuestions: 'Unclear from session.',
      structureAndPacing:  'Insufficient data.',
      fillerWords:         'Insufficient data.',
      underPressure:       'Not evaluated.',
    },
    keyMoments: [
      { type: 'tip', title: 'Engage more', detail: 'Practice thinking aloud — a silent candidate is invisible to the interviewer.' },
    ],
    codeOrDesignFeedback: {
      approach:   'Insufficient data.',
      execution:  'Insufficient data.',
      edgeCases:  'Not evaluated.',
      complexity: 'Not evaluated.',
    },
    sde3Assessment: {
      currentLevel: 'Borderline SDE-3',
      gaps: 'More session data needed to identify specific gaps.',
      strengths: 'Not enough data to identify demonstrated strengths.',
      timeline: 'Complete a full session to get an accurate assessment.',
    },
    nextSteps: [
      'Complete a full 45-minute mock interview session',
      'Think aloud throughout — narrate every decision',
      'Ask clarifying questions before starting to solve',
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   RENDER FEEDBACK REPORT
═══════════════════════════════════════════════════════════════════════ */

function renderFeedback(fb, problem, round, prevSessions) {
  /* ── Score ring ────────────────────────────────────────────────────── */
  const score = fb.overall || 60;
  document.getElementById('fb-n').textContent = score;
  const ring = document.getElementById('rp');
  if (ring) {
    const colour = score >= 75 ? '#22c55e' : score >= 55 ? '#f59e0b' : '#ef4444';
    ring.setAttribute('stroke-dashoffset', Math.round(251.2 - (score / 100) * 251.2));
    ring.setAttribute('stroke', colour);
  }

  /* ── Hero ──────────────────────────────────────────────────────────── */
  const vicon = (fb.verdict?.includes('Strong Hire') || fb.verdict === 'Hire') ? '✅'
              :  fb.verdict?.includes('No Hire')                                ? '❌' : '🟡';
  document.getElementById('fb-round-lbl').textContent = `${problem.title} · ${round}`;
  document.getElementById('fb-verd').textContent      = `${vicon} ${fb.verdict || 'Borderline'}`;
  document.getElementById('fb-sum').textContent       = fb.hiringSummary || '';

  const body = document.getElementById('fb-body');
  body.innerHTML = '';

  /* ── 1. Score breakdown (round-specific rubrics) ───────────────────── */
  body.appendChild(_makeSection('ti-chart-bar', `${round} Round — Score Breakdown`, _renderCategories(fb.categories)));

  /* ── 2. Communication analysis ─────────────────────────────────────── */
  if (fb.communicationAnalysis) {
    const ca = fb.communicationAnalysis;
    body.appendChild(_makeSection('ti-message-dots', 'Communication Analysis', _renderQuotes(ca,
      ['thinkAloud', 'clarifyingQuestions', 'structureAndPacing', 'fillerWords', 'underPressure'],
      ['Think-aloud', 'Clarifying questions', 'Structure & pacing', 'Verbal fluency', 'Under pressure']
    )));
  }

  /* ── 3. Key moments ────────────────────────────────────────────────── */
  if (fb.keyMoments?.length) {
    body.appendChild(_makeSection('ti-flame', 'Key Moments From This Session', _renderMoments(fb.keyMoments)));
  }

  /* ── 4. Code / Design feedback ─────────────────────────────────────── */
  if (fb.codeOrDesignFeedback) {
    const cdf = fb.codeOrDesignFeedback;
    const isDesign = ['HLD','LLD'].includes(round);
    body.appendChild(_makeSection('ti-code', isDesign ? 'Design Analysis' : 'Code & Algorithm Analysis',
      _renderQuotes(cdf,
        ['approach', 'execution', 'edgeCases', 'complexity'],
        [isDesign ? 'Approach & Architecture' : 'Algorithmic Approach',
         isDesign ? 'Depth & Completeness' : 'Implementation',
         isDesign ? 'Trade-offs & Gaps' : 'Edge Cases',
         isDesign ? 'Scalability Claims' : 'Complexity Analysis']
      )
    ));
  }

  /* ── 5. SDE-3 assessment ────────────────────────────────────────────── */
  if (fb.sde3Assessment) {
    const sa = fb.sde3Assessment;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.65rem';

    const levelEl = document.createElement('div');
    const lvl = sa.currentLevel || '';
    const lvlColour = lvl.includes('Above') ? '#22c55e' : lvl.includes('SDE-3') && !lvl.includes('Borderline') ? '#60a5fa' : lvl.includes('Borderline') ? '#f59e0b' : '#f87171';
    levelEl.innerHTML = `<div style="font-size:0.68rem;color:var(--mut);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Current Bar</div>
      <div style="font-size:1rem;font-weight:700;color:${lvlColour}">${sanitise(lvl)}</div>`;
    wrap.appendChild(levelEl);

    for (const [label, key] of [['Demonstrated Strengths','strengths'],['Gaps to Close','gaps'],['Realistic Timeline','timeline']]) {
      if (sa[key]) {
        const d = document.createElement('div');
        d.className = 'fb-quote';
        d.innerHTML = `<div class="fb-quote-ctx">${label}</div><div class="fb-quote-txt">${sanitise(sa[key])}</div>`;
        wrap.appendChild(d);
      }
    }
    body.appendChild(_makeSection('ti-target', 'SDE-3 Bar Assessment', wrap));
  }

  /* ── 6. Action plan ─────────────────────────────────────────────────── */
  if (fb.nextSteps?.length) {
    const ol = document.createElement('div');
    ol.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    fb.nextSteps.forEach((step, i) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(124,111,255,0.08)';
      d.innerHTML =
        `<span style="min-width:24px;height:24px;border-radius:50%;background:rgba(124,111,255,0.2);
          color:var(--acc2);display:flex;align-items:center;justify-content:center;
          font-size:0.65rem;font-weight:700;flex-shrink:0">${i + 1}</span>
         <span style="font-size:0.77rem;color:#ccc;line-height:1.6">${sanitise(step)}</span>`;
      ol.appendChild(d);
    });
    body.appendChild(_makeSection('ti-list-check', 'Action Plan — Next 2 Weeks', ol));
  }

  /* ── 7. History comparison (requires prevSessions from room.js) ──────── */
  if (prevSessions?.length > 0 && typeof renderHistoryComparison === 'function') {
    renderHistoryComparison(fb, round, prevSessions);
  }
}

/* ── Section / element builders ───────────────────────────────────────── */

function _makeSection(icon, title, contentEl) {
  const sec = document.createElement('div');
  sec.className = 'fb-section';
  sec.innerHTML = `<div class="fb-sec-hdr"><i class="ti ${icon}" aria-hidden="true"></i>${sanitise(title)}</div>`;
  const body = document.createElement('div');
  body.className = 'fb-sec-body';
  if (contentEl instanceof Element) body.appendChild(contentEl);
  else body.innerHTML = contentEl;
  sec.appendChild(body);
  return sec;
}

function _renderCategories(cats) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:1rem';
  (cats || []).forEach(cat => {
    const s  = Math.min(100, Math.max(0, cat.score || 60));
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
  (moments || []).forEach(m => {
    const d = document.createElement('div');
    d.className = `fb-moment ${m.type === 'good' ? 'good-m' : m.type === 'bad' ? 'bad-m' : 'tip-m'}`;
    const lbl = m.type === 'good' ? '✓ What you did well' : m.type === 'bad' ? '✗ Missed opportunity' : '→ Pro tip';
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

/* ═══════════════════════════════════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════════════════════════════════ */

function exportFeedback(problem, round) {
  const fb = _lastFeedback;
  if (!fb) return;

  const sa = fb.sde3Assessment || {};

  const lines = [
    'FAANG MOCK INTERVIEW REPORT',
    '='.repeat(60),
    `Problem   : ${problem.title}`,
    `Round     : ${round}`,
    `Verdict   : ${fb.verdict}`,
    `Score     : ${fb.overall}/100`,
    `SDE-3 Bar : ${sa.currentLevel || '—'}`,
    '',
    'HIRING SUMMARY',
    '-'.repeat(40),
    fb.hiringSummary || '',
    '',
    'RUBRIC BREAKDOWN',
    '-'.repeat(40),
    ...(fb.categories || []).map(c => [
      `\n${c.name}: ${c.score}/100`,
      ...(c.goods    || []).map(g => `  ✓ ${g}`),
      ...(c.improves || []).map(i => `  ↗ ${i}`),
      c.critical ? `  ✗ Critical: ${c.critical}` : '',
    ].join('\n')),
    '',
    'COMMUNICATION ANALYSIS',
    '-'.repeat(40),
    ...(fb.communicationAnalysis ? Object.entries(fb.communicationAnalysis).map(([k, v]) => `  ${k}: ${v}`) : []),
    '',
    'CODE / DESIGN FEEDBACK',
    '-'.repeat(40),
    ...(fb.codeOrDesignFeedback ? Object.entries(fb.codeOrDesignFeedback).map(([k, v]) => `  ${k}: ${v}`) : []),
    '',
    'SDE-3 ASSESSMENT',
    '-'.repeat(40),
    `Current Level: ${sa.currentLevel || '—'}`,
    `Strengths: ${sa.strengths || '—'}`,
    `Gaps: ${sa.gaps || '—'}`,
    `Timeline: ${sa.timeline || '—'}`,
    '',
    'ACTION PLAN',
    '-'.repeat(40),
    ...(fb.nextSteps || []).map((s, i) => `  ${i + 1}. ${s}`),
    '',
    `Generated : ${new Date().toLocaleString('en-IN')}`,
    'Note: data is local — nothing stored beyond this file.',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `interview_${round}_${Date.now()}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
