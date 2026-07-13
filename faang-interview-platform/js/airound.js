/**
 * airound.js — AI Knowledge Round (Learning Mode)
 *
 * This is a LEARNING round, not a pure test:
 *  • 5 difficulty levels (Fundamentals → Application)
 *  • Advance level after CONFIG.AI_CORRECT_TO_ADVANCE correct answers
 *  • Every answer reveals the model solution so the candidate learns
 *  • Auto-generates questions via Claude based on the topic and level
 *
 * State machine:
 *   IDLE → GENERATING_QUESTION → AWAITING_ANSWER → SHOWING_SOLUTION → (repeat / advance)
 */

const AI_ROUND = (() => {
  let _topic    = null;   // AI topic object from QB
  let _level    = 1;      // current difficulty level (1–5)
  let _correct  = 0;      // correct answers at current level
  let _question = '';     // current question text
  let _solution = '';     // model solution for current question
  let _state    = 'IDLE';

  const LEVEL_LABELS = {
    1: '🟢 Fundamentals',
    2: '🔵 Mechanisms',
    3: '🟡 Trade-offs',
    4: '🟠 Edge Cases',
    5: '🔴 Application / Design',
  };

  /* ── Render the progress bar ────────────────────────────────────────── */
  function _renderProgress() {
    const container = document.getElementById('ai-progress');
    if (!container) return;

    container.innerHTML = '';

    // 5 level dots
    for (let i = 1; i <= CONFIG.AI_TOTAL_LEVELS; i++) {
      const dot = document.createElement('div');
      dot.className = 'ai-dot' + (i < _level ? ' done' : i === _level ? ' active' : '');
      dot.title = LEVEL_LABELS[i];
      container.appendChild(dot);

      if (i < CONFIG.AI_TOTAL_LEVELS) {
        const line = document.createElement('div');
        line.className = 'ai-line' + (i < _level ? ' done' : '');
        container.appendChild(line);
      }
    }

    // Correct-answers mini-dots for current level
    const miniRow = document.createElement('div');
    miniRow.className = 'ai-mini-row';
    for (let j = 0; j < CONFIG.AI_CORRECT_TO_ADVANCE; j++) {
      const m = document.createElement('span');
      m.className = 'ai-mini' + (j < _correct ? ' filled' : '');
      miniRow.appendChild(m);
    }
    container.appendChild(miniRow);

    // Level label
    const lbl = document.getElementById('ai-level-lbl');
    if (lbl) lbl.textContent = LEVEL_LABELS[_level] || `Level ${_level}`;
  }

  /* ── Generate a new question via Claude ─────────────────────────────── */
  async function _generateQuestion() {
    _state = 'GENERATING_QUESTION';

    const levelDesc = _topic.difficultyLevels?.[_level] || `Level ${_level} question`;
    const subtopics = (_topic.subtopics || []).join(', ');

    const prompt =
      `Topic: "${_topic.title}"\n` +
      `Subtopics: ${subtopics}\n` +
      `Level ${_level} style: ${levelDesc}\n\n` +
      `Generate ONE clear question at this difficulty. ` +
      `Return ONLY JSON:\n` +
      `{"question": "...", "expectedKeyPoints": ["point1","point2","point3"]}`;

    const raw = await callClaude(
      [{ role: 'user', content: prompt }],
      'You are an AI/ML interviewer. Generate technically precise questions. Return ONLY valid JSON.',
      400
    );

    let parsed = { question: `Explain ${levelDesc}`, expectedKeyPoints: [] };
    try {
      parsed = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
    } catch (_) {}

    _question = parsed.question;

    // Show question in the AI round UI
    const qEl = document.getElementById('ai-question-text');
    if (qEl) qEl.textContent = _question;

    document.getElementById('ai-answer-area').style.display = 'flex';
    document.getElementById('ai-solution-area').style.display = 'none';
    document.getElementById('ai-answer-input').value = '';
    document.getElementById('ai-answer-input').focus();

    _state = 'AWAITING_ANSWER';
    _renderProgress();
  }

  /* ── Evaluate candidate answer and show model solution ───────────────── */
  async function _evaluateAnswer(candidateAnswer) {
    if (_state !== 'AWAITING_ANSWER' || !candidateAnswer.trim()) return;
    _state = 'SHOWING_SOLUTION';

    const loadEl = document.getElementById('ai-loading');
    if (loadEl) loadEl.style.display = 'flex';

    const prompt =
      `Question: "${_question}"\n` +
      `Candidate's answer: "${candidateAnswer}"\n\n` +
      `1. Judge if the answer is essentially correct (for a ${LEVEL_LABELS[_level]} level question).\n` +
      `2. Provide a comprehensive model solution.\n\n` +
      `Return ONLY JSON:\n` +
      `{\n` +
      `  "isCorrect": true/false,\n` +
      `  "feedback": "2-sentence assessment of the answer",\n` +
      `  "modelSolution": "Detailed solution with explanation, analogies, and any code if relevant",\n` +
      `  "keyPoints": ["point the candidate should know"],\n` +
      `  "proTip": "One advanced insight about this topic"\n` +
      `}`;

    const raw = await callClaude(
      [{ role: 'user', content: prompt }],
      `You are an AI/ML expert and educator. Topic: "${_topic.title}". ` +
      `Be generous with "isCorrect" — if they got the gist right, count it. ` +
      `The model solution should be educational and thorough. Return ONLY valid JSON.`,
      900
    );

    if (loadEl) loadEl.style.display = 'none';

    let result = {
      isCorrect: false,
      feedback: 'Could not evaluate — please try again.',
      modelSolution: 'Solution unavailable.',
      keyPoints: [],
      proTip: '',
    };
    try {
      result = JSON.parse((raw || '').replace(/```json|```/g, '').trim());
    } catch (_) {}

    _solution = result.modelSolution;

    // Update correct counter
    if (result.isCorrect) {
      _correct++;
      if (_correct >= CONFIG.AI_CORRECT_TO_ADVANCE && _level < CONFIG.AI_TOTAL_LEVELS) {
        _level++;
        _correct = 0;
      }
    }

    // Render solution card
    const solEl = document.getElementById('ai-solution-area');
    if (solEl) {
      solEl.style.display = 'flex';

      document.getElementById('ai-verdict').className =
        'ai-verdict ' + (result.isCorrect ? 'correct' : 'incorrect');
      document.getElementById('ai-verdict-text').textContent =
        result.isCorrect ? '✓ Correct' : '✗ Not quite';

      const feedEl = document.getElementById('ai-feedback');
      if (feedEl) feedEl.textContent = result.feedback;

      const solText = document.getElementById('ai-solution-text');
      if (solText) solText.textContent = result.modelSolution;

      const kpEl = document.getElementById('ai-key-points');
      if (kpEl) {
        kpEl.innerHTML = '';
        (result.keyPoints || []).forEach(kp => {
          const li = document.createElement('li');
          li.textContent = kp;
          kpEl.appendChild(li);
        });
      }

      const tipEl = document.getElementById('ai-pro-tip');
      if (tipEl) tipEl.textContent = result.proTip || '';
    }

    document.getElementById('ai-answer-area').style.display = 'none';
    _renderProgress();
  }

  /* ── Public API ─────────────────────────────────────────────────────── */
  return {
    /** Initialise with an AI topic from QB and start Level 1. */
    start(topic) {
      _topic   = topic;
      _level   = 1;
      _correct = 0;
      _state   = 'IDLE';
      _renderProgress();
      _generateQuestion();
    },

    /** Candidate submitted an answer. */
    submitAnswer(text) { _evaluateAnswer(text); },

    /** "Next question" button — generate a new question at current level. */
    nextQuestion() {
      if (_state !== 'SHOWING_SOLUTION') return;
      _generateQuestion();
    },

    get level()   { return _level; },
    get correct() { return _correct; },
  };
})();
