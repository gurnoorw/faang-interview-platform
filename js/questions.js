/**
 * questions.js — Persistent Question Bank
 *
 * Rounds: DSA | HLD | LLD | BEH | AI
 *
 * Public API (QB object):
 *   QB.get(round)         → question array
 *   QB.add(round, q)      → saves and returns question with generated id
 *   QB.update(id, patch)  → merges patch, saves, returns question
 *   QB.remove(id)         → deletes by id, returns boolean
 *   QB.reset()            → restores factory defaults
 *   QB.importLeetcode(url, html) → parses pasted LC html into DSA object
 *
 * Storage: localStorage key 'faang_qb_v3'
 */

const QB_STORAGE_KEY = 'faang_qb_v3';
const _uid = () => `q_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

/* ── DSA defaults ──────────────────────────────────────────────────────── */
const DEFAULT_DSA = [
  {
    id: 'dsa_lru', title: 'LRU Cache', difficulty: 'medium',
    topic: 'Hash Map + Doubly Linked List', timeMin: 45,
    source: 'LeetCode 146', sourceUrl: 'https://leetcode.com/problems/lru-cache/',
    description:
      'Design a data structure that follows Least Recently Used cache constraints.\n\n' +
      '• LRUCache(capacity) — init with positive size\n' +
      '• get(key) → value or -1\n' +
      '• put(key, value) — insert or update; evict LRU if over capacity\n\n' +
      'Both ops MUST be O(1) average.',
    examples: [{ input: 'LRUCache(2)\nput(1,1), put(2,2)\nget(1) → 1\nput(3,3) evicts key 2\nget(2) → -1', output: 'See inline' }],
    constraints: ['1 ≤ capacity ≤ 3000', '≤ 2×10⁵ calls', 'O(1) for both ops'],
    testCases: [
      { input: 'LRUCache(2); put(1,1); put(2,2); get(1)', expected: '1' },
      { input: 'put(3,3); get(2)',                        expected: '-1' },
      { input: 'LRUCache(1); put(1,1); put(2,2); get(1)', expected: '-1 (evicted)' },
    ],
    starterCode: {
      python: `class LRUCache:\n    def __init__(self, capacity: int):\n        pass  # hint: use OrderedDict or HashMap + DLL\n\n    def get(self, key: int) -> int:\n        pass\n\n    def put(self, key: int, value: int) -> None:\n        pass`,
      java:   `class LRUCache {\n    public LRUCache(int capacity) { }\n    public int get(int key) { return -1; }\n    public void put(int key, int value) { }\n}`,
      cpp:    `class LRUCache {\npublic:\n    LRUCache(int capacity) { }\n    int get(int key) { return -1; }\n    void put(int key, int value) { }\n};`,
      javascript: `class LRUCache {\n  constructor(capacity) { }\n  get(key) { return -1; }\n  put(key, value) { }\n}`,
    },
    systemPrompt: `You are Priya Sharma, SDE-3 at Amazon, interviewing for SDE-3. Problem: LRU Cache.
Probe: "Walk me through WHY that's O(1) — what gives O(1) order tracking?"
If OrderedDict: "Implement from scratch without OrderedDict."
Edge: capacity=1 and duplicate put. Keep replies 1-3 sentences.`,
  },
  {
    id: 'dsa_merge', title: 'Merge Intervals', difficulty: 'medium',
    topic: 'Sorting + Greedy', timeMin: 35,
    source: 'LeetCode 56', sourceUrl: 'https://leetcode.com/problems/merge-intervals/',
    description: 'Given intervals[i]=[start,end], merge all overlapping intervals.',
    examples: [{ input: '[[1,3],[2,6],[8,10],[15,18]]', output: '[[1,6],[8,10],[15,18]]' }],
    constraints: ['1 ≤ n ≤ 10⁴', '0 ≤ start ≤ end ≤ 10⁴'],
    testCases: [
      { input: '[[1,3],[2,6],[8,10],[15,18]]', expected: '[[1,6],[8,10],[15,18]]' },
      { input: '[[1,4],[4,5]]', expected: '[[1,5]]' },
    ],
    starterCode: {
      python: 'def merge(intervals: list[list[int]]) -> list[list[int]]:\n    pass',
      java:   'public int[][] merge(int[][] intervals) { return new int[][]{}; }',
      cpp:    'vector<vector<int>> merge(vector<vector<int>>& intervals) { return {}; }',
      javascript: 'var merge = function(intervals) { };',
    },
    systemPrompt: `You are Ananya, Google SDE-3, interviewing for SDE-3. Problem: Merge Intervals.
If no sort: "Try [[1,3],[4,6],[2,5]] — does your algorithm still work without sorting?"
Boundary: "[1,4],[4,5] — overlapping or not? What's your condition?"
After solution: "Time and space complexity?" Keep replies 1-3 sentences.`,
  },
  {
    id: 'dsa_trap_rain', title: 'Trapping Rain Water', difficulty: 'hard',
    topic: 'Two Pointers', timeMin: 40,
    source: 'LeetCode 42', sourceUrl: 'https://leetcode.com/problems/trapping-rain-water/',
    description: 'Given an elevation map, compute how much water it traps after raining.',
    examples: [{ input: '[0,1,0,2,1,0,1,3,2,1,2,1]', output: '6' }],
    constraints: ['1 ≤ n ≤ 2×10⁴', '0 ≤ height[i] ≤ 10⁵'],
    testCases: [{ input: '[0,1,0,2,1,0,1,3,2,1,2,1]', expected: '6' }],
    starterCode: {
      python: 'def trap(height: list[int]) -> int:\n    pass',
      java:   'public int trap(int[] height) { return 0; }',
      cpp:    'int trap(vector<int>& height) { return 0; }',
      javascript: 'var trap = function(height) { };',
    },
    systemPrompt: `You are Ananya, Google. Problem: Trapping Rain Water.
If O(n) space approach: "Can you achieve O(1) space?"
If two-pointer: "Explain WHY min(left_max, right_max) gives the correct water level." Keep 1-3 sentences.`,
  },
  {
    id: 'dsa_word_ladder', title: 'Word Ladder', difficulty: 'hard',
    topic: 'BFS + Graph', timeMin: 50,
    source: 'LeetCode 127', sourceUrl: 'https://leetcode.com/problems/word-ladder/',
    description: 'Return the number of words in the shortest transformation from beginWord to endWord (one letter change at a time, each intermediate word in wordList).',
    examples: [{ input: 'hit → cog, dict=[hot,dot,dog,lot,log,cog]', output: '5' }],
    constraints: ['1 ≤ wordLength ≤ 10', '1 ≤ wordList.length ≤ 5000'],
    testCases: [
      { input: 'hit → cog, dict has cog', expected: '5' },
      { input: 'hit → cog, dict missing cog', expected: '0' },
    ],
    starterCode: {
      python: 'def ladderLength(beginWord, endWord, wordList):\n    pass',
      java:   'public int ladderLength(String b, String e, List<String> w) { return 0; }',
      cpp:    'int ladderLength(string b, string e, vector<string>& w) { return 0; }',
      javascript: 'var ladderLength = function(beginWord, endWord, wordList) { };',
    },
    systemPrompt: `You are Rahul, Meta Staff Eng. Problem: Word Ladder.
"Why BFS and not DFS?" force proof of shortest path. Naive O(n*L): "Precompute a pattern map instead."
Follow-up: "How does bidirectional BFS halve search space?" Keep 1-3 sentences.`,
  },
  {
    id: 'dsa_kth_largest', title: 'Kth Largest in a Stream', difficulty: 'easy',
    topic: 'Heap', timeMin: 30,
    source: 'LeetCode 703', sourceUrl: 'https://leetcode.com/problems/kth-largest-element-in-a-stream/',
    description: 'Design a class to find the kth largest element in a stream.',
    examples: [{ input: 'KthLargest(3,[4,5,8,2]); add(3)→4; add(5)→5', output: 'Shown inline' }],
    constraints: ['1 ≤ k ≤ 10⁴'],
    testCases: [{ input: 'k=3, init=[4,5,8,2], add(3)', expected: '4' }],
    starterCode: {
      python: 'import heapq\nclass KthLargest:\n    def __init__(self, k: int, nums: list[int]):\n        pass\n    def add(self, val: int) -> int:\n        pass',
      java:   'class KthLargest {\n    public KthLargest(int k, int[] nums) { }\n    public int add(int val) { return 0; }\n}',
      cpp:    'class KthLargest {\npublic:\n    KthLargest(int k, vector<int>& nums) { }\n    int add(int val) { return 0; }\n};',
      javascript: 'class KthLargest {\n  constructor(k, nums) { }\n  add(val) { return 0; }\n}',
    },
    systemPrompt: `You are Vikram, Google SDE-3. Problem: Kth Largest in Stream.
"Why min-heap not max-heap? Walk me through the invariant."
"What's heap size at all times? What if k > stream size so far?"
"Prove add() is O(log k)." Keep 1-3 sentences.`,
  },
];

/* ── HLD defaults ──────────────────────────────────────────────────────── */
const DEFAULT_HLD = [
  {
    id: 'hld_twitter', title: 'Design Twitter / X', difficulty: 'hard',
    topic: 'Feed Systems, Fan-out, Sharding', timeMin: 60,
    description: 'Design core Twitter for 100M DAU.\nIn-scope: tweet posting, home timeline, follow/unfollow, user profile.\nNFRs: 200M tweets/day, Read:Write=100:1, timeline<200ms P99, 99.99% uptime.',
    expectedCoverage: [
      'Back-of-envelope: QPS, storage, bandwidth',
      'API design (POST /tweet, GET /timeline)',
      'Fan-out strategy: write-time vs read-time vs hybrid for celebrities',
      'DB choice: relational for social graph, NoSQL for tweets',
      'Caching: Redis timeline, CDN for media',
      'SPOF identification and mitigation',
    ],
    nfrs: ['~2,300 TPS write', '~230K TPS read', 'P99 timeline < 200ms', '99.99% availability'],
    hasWhiteboard: true,
    systemPrompt: `You are Rahul Gupta, Staff Eng at Meta, interviewing for SDE-3. Problem: Design Twitter.
No architecture diagrams before back-of-envelope numbers.
Celebrity problem: fan-out-write → "150M followers, fan-out takes hours"; fan-out-read → "1000 feeds merged at read time, how many DB queries?"
Always ask: "Where is your SPOF?" Keep 1-3 sentences.`,
  },
  {
    id: 'hld_rate_limiter', title: 'Distributed Rate Limiter', difficulty: 'medium',
    topic: 'Distributed Systems, Redis, Race Conditions', timeMin: 55,
    description: 'Design a distributed rate limiter for 10M req/s across a server fleet.\nSupport at least one algo: token bucket, sliding window, or fixed window.\nNFRs: <5ms added latency, ±0.1% accuracy, 100+ servers.',
    expectedCoverage: [
      'Algorithm trade-offs',
      'Redis INCR + Lua script for atomicity',
      'Race condition: two servers check simultaneously',
      'Fail-open vs fail-closed on Redis outage',
      'Per-user + per-API-key limits',
    ],
    nfrs: ['10M req/s', '<5ms P99', '±0.1% accuracy'],
    hasWhiteboard: true,
    systemPrompt: `You are Priya, Staff Eng at Amazon. Problem: Distributed Rate Limiter.
Redis down: "Fail open or closed — justify."
Race: "Server A and B both see counter=99, both allow. Now you have 101. Fix?"
Memory: "Sliding window log stores one entry per request — what's memory per heavy user?" Keep 1-3 sentences.`,
  },
  {
    id: 'hld_url_shortener', title: 'Design URL Shortener (bit.ly)', difficulty: 'medium',
    topic: 'Key-Value, Hashing, Caching', timeMin: 50,
    description: 'Design a URL shortening service handling 100M URLs/day.\nFeatures: shorten, redirect, analytics, custom aliases, expiry.\nNFRs: redirect <10ms P99, 10B reads/day.',
    expectedCoverage: [
      'Short code generation strategy (hash vs random vs counter)',
      'Collision avoidance',
      'Read-heavy architecture: cache layer',
      'Analytics pipeline (async, eventual consistency OK)',
      'Expiry: TTL strategy',
    ],
    nfrs: ['100M writes/day ~1,200 TPS', '10B reads/day ~115K TPS', 'Redirect <10ms P99'],
    hasWhiteboard: true,
    systemPrompt: `You are Ananya, Google. Problem: URL Shortener.
Uniqueness: "Random 6 chars — probability of collision at 1B URLs? Show math."
Concurrency: "Two servers generate same code simultaneously — how do you detect?"
Cache cold start: "What happens on first request after cache flush?" Keep 1-3 sentences.`,
  },
];

/* ── LLD defaults ──────────────────────────────────────────────────────── */
const DEFAULT_LLD = [
  {
    id: 'lld_parking', title: 'Parking Lot System', difficulty: 'medium',
    topic: 'OOP, Strategy Pattern, Thread Safety', timeMin: 55,
    description: 'Design a Parking Lot system.\nSpot types: Compact, Large, Handicapped, Motorbike, Electric.\nVehicles: Car, Truck (needs 2 Large), Motorbike, EV.\nPricing: ₹30/hr Compact, ₹50/hr Large, ₹80/hr Electric.\nFeatures: entry ticket, exit fee, monthly pass, concurrent entry.',
    requirements: [
      'SOLID principles',
      'Thread-safe: two vehicles enter simultaneously',
      'Strategy pattern for pricing (extensible)',
      'New spot type = zero changes to existing classes',
    ],
    expectedClasses: [
      'Vehicle (abstract) → Car, Truck, Motorbike, EV',
      'ParkingSpot (abstract) → CompactSpot, LargeSpot, ElectricSpot',
      'PricingStrategy interface → HourlyPricing, MonthlyPass',
      'ParkingLot (facade)',
      'Ticket (value object)',
    ],
    hasWhiteboard: true,
    systemPrompt: `You are Ananya, Principal Eng at Flipkart. Problem: Parking Lot.
Single Vehicle class with type field: "Truck needs 2 spots — is that an if-statement?"
No thread safety: "Two cars arrive simultaneously, both check same spot — show me the lock."
Over-locking: "You lock entire lot — 1000 spots serialise on one mutex. Acceptable?" Keep 1-3 sentences.`,
  },
  {
    id: 'lld_notification', title: 'Notification System', difficulty: 'medium',
    topic: 'Observer Pattern, Factory, Retry Queue', timeMin: 50,
    description: 'Design a notification system for e-commerce.\nChannels: Email, SMS, Push, WhatsApp.\nTriggers: order placed, payment failed, delivery update, promos.\nFeatures: per-user opt-out per channel, rate limiting, retry, priority.',
    requirements: [
      'Observer pattern: event → channel dispatch',
      'Factory: correct sender without caller knowing type',
      'Rate limiting: max 3 SMS/hr per user',
      'Retry: exponential backoff, dead-letter queue after 3 failures',
      'Priority: CRITICAL alerts override opt-out',
    ],
    expectedClasses: [
      'NotificationChannel interface → EmailSender, SmsSender, PushSender',
      'NotificationFactory',
      'UserPreferenceService',
      'RetryQueue',
      'NotificationEvent (value object)',
    ],
    hasWhiteboard: false,
    systemPrompt: `You are Vikram, Principal Eng at Google. Problem: Notification System.
Observer: "What is your Subject and Observers in pattern terms?"
OCP: "Adding WhatsApp — which classes do you modify?"
Opt-out override: "User opted out of SMS. Fraud alert arrives. Show me in code where override happens."
DLQ: "3 retries failed. What's in DLQ and who reads it?" Keep 1-3 sentences.`,
  },
  {
    id: 'lld_elevator', title: 'Elevator Control System', difficulty: 'hard',
    topic: 'State Machine, OOP, Scheduling', timeMin: 60,
    description: 'Design an Elevator control system for a 50-floor building with 4 elevators.\nFeatures: user presses floor button, system assigns optimal elevator, movement, doors.\nAlgorithm: SCAN/LOOK for optimal movement.',
    requirements: [
      'State machine: IDLE, MOVING_UP, MOVING_DOWN, DOORS_OPEN',
      'Concurrent floor requests',
      'Optimal assignment: nearest idle or add to path',
      'Handle emergency stop and door-open while moving',
    ],
    expectedClasses: [
      'ElevatorController (coordinator)',
      'Elevator (state machine)',
      'FloorRequest (value object)',
      'AssignmentStrategy interface → NearestIdleStrategy, SCANStrategy',
    ],
    hasWhiteboard: true,
    systemPrompt: `You are Priya, Amazon Principal Eng. Problem: Elevator System.
Assignment: "Elevator at floor 5 going up, someone at floor 3 pressed up — does it stop?"
State machine: "Walk me through EVERY valid state transition. What if floor request comes during DOORS_OPEN?"
Concurrency: "Two users press same floor simultaneously — what happens in your code?" Keep 1-3 sentences.`,
  },
];

/* ── BEH defaults ──────────────────────────────────────────────────────── */
const DEFAULT_BEH = [
  {
    id: 'beh_ownership', title: 'Ownership & Accountability',
    question: 'Tell me about a time you took ownership of a problem outside your scope.',
    probes: [
      'What made you decide this was your problem?',
      'Who pushed back and how did you handle it?',
      'What was the actual impact — give me numbers.',
      'What would have happened if you hadn\'t stepped in?',
    ],
    signals: ['Proactively owns ambiguous problems', 'Drives resolution vs escalates', 'Quantifies impact', 'Cross-team influence'],
    systemPrompt: `You are Vikram Nair, EM at Google, running behavioural for SDE-3.
Question: "Tell me about a time you took ownership of a problem outside your scope."
Probe STAR deeply. If answer sounds SDE-2 (single-team): "Do you have something with broader org impact?"
Push for specifics: "what did YOU do?", numbers: "by how much?". Keep 1-3 sentences.`,
  },
  {
    id: 'beh_failure', title: 'Biggest Technical Failure',
    question: 'Describe your biggest technical failure. What did you do, and what did you learn?',
    probes: [
      'What was your specific role — what decisions did YOU make?',
      'What was the customer or business impact?',
      'What changed in your process afterward?',
      'Have you applied the learning since?',
    ],
    signals: ['Self-awareness without being defensive', 'Owns failure not circumstance', 'Systems-thinking in retrospective'],
    systemPrompt: `You are Priya Sharma, Amazon SDE-3, running behavioural for SDE-3.
Question: "Describe your biggest technical failure."
Red flags: generic failures, no quantified impact, blaming external factors, shallow learning.
"What was the actual customer impact — downtime? Revenue? Users affected?" Keep 1-3 sentences.`,
  },
  {
    id: 'beh_influence', title: 'Influence Without Authority',
    question: 'Tell me about a time you influenced a team outside your own without formal authority.',
    probes: [
      'Why did they have no reason to listen initially?',
      'What tactics — data, demos, 1:1s?',
      'What did you do when they pushed back?',
      'Outcome and measurement?',
    ],
    signals: ['Builds cross-team consensus', 'Data + storytelling over authority', 'SDE-3 org-wide impact'],
    systemPrompt: `You are Ananya Krishnan, Principal Eng at Flipkart, running behavioural for SDE-3.
Question: "Tell me about influencing a team outside your own without authority."
If same-team: "That's solid but same-team. I need a cross-org example."
"When they said no — walk me through that conversation." Keep 1-3 sentences.`,
  },
  {
    id: 'beh_conflict', title: 'Disagree and Commit',
    question: 'Tell me about a time you strongly disagreed with your manager or a senior engineer on a technical decision.',
    probes: [
      'Why did you disagree — what data did you have?',
      'How did you raise it?',
      'Once decided against you, how did you behave?',
      'In retrospect, who was right?',
    ],
    signals: ['Constructive disagreement with data', 'Commits once decided', 'Knows when to escalate vs let go'],
    systemPrompt: `You are Rahul Gupta, Staff Eng at Meta, running behavioural for SDE-3.
Question: "Tell me about a time you disagreed with your manager on a technical decision."
If always resolved peacefully: "Were there cases where the decision went against you and you still executed? What did that feel like?"
"Once final, did you fully commit or resist in subtle ways?" Keep 1-3 sentences.`,
  },
  {
    id: 'beh_incomplete_data', title: 'Decision Under Uncertainty',
    question: 'Tell me about a time you made an important decision with incomplete or conflicting data.',
    probes: [
      'What data was missing and why couldn\'t you get it?',
      'What was the risk of getting this wrong?',
      'How did you decide anyway?',
      'What would you do differently?',
    ],
    signals: ['Comfortable with ambiguity', 'Structured decision under uncertainty', 'Quantifies and mitigates risk'],
    systemPrompt: `You are Vikram Nair, EM Google, running behavioural for SDE-3.
Question: "Tell me about a decision with incomplete or conflicting data."
If waited for perfect data: "SDE-3 can't always wait — how do you make progress without certainty?"
If pure gut call: "How did you de-risk it?" Keep 1-3 sentences.`,
  },
];

/* ── AI Knowledge defaults ─────────────────────────────────────────────── */
const DEFAULT_AI = [
  {
    id: 'ai_ml_fundamentals', title: 'ML Fundamentals',
    subtopics: [
      'Supervised vs Unsupervised vs Reinforcement Learning',
      'Bias-variance trade-off',
      'Overfitting and regularisation (L1/L2)',
      'Cross-validation strategies',
      'Feature engineering and selection',
    ],
    difficultyLevels: {
      1: 'Basic definitions and intuition — "What is supervised learning and give 3 examples?"',
      2: 'Mechanical understanding — "How does gradient descent update weights? Show the math."',
      3: 'Trade-offs — "When do you prefer L1 over L2 regularisation and why?"',
      4: 'Edge cases — "When does k-fold cross-validation give misleading results?"',
      5: 'System design — "Design an ML pipeline for real-time fraud detection at 100K TPS."',
    },
  },
  {
    id: 'ai_llms', title: 'Large Language Models',
    subtopics: [
      'Transformer architecture and self-attention',
      'Pre-training vs fine-tuning vs RLHF',
      'Prompt engineering and in-context learning',
      'Hallucinations and mitigation',
      'RAG (Retrieval-Augmented Generation)',
    ],
    difficultyLevels: {
      1: 'What is an LLM and how does it generate text token by token?',
      2: 'Walk me through what the self-attention mechanism computes (Q, K, V).',
      3: 'When do you fine-tune vs use RAG vs few-shot prompting?',
      4: 'Why do LLMs hallucinate? What are the fundamental limits of mitigation?',
      5: 'Design a production LLM system: <200ms latency for 10M users/day.',
    },
  },
  {
    id: 'ai_deep_learning', title: 'Deep Learning & Neural Networks',
    subtopics: [
      'Backpropagation and chain rule',
      'CNNs for image tasks',
      'RNN / LSTM / GRU for sequences',
      'Batch normalisation and dropout',
      'Transfer learning',
    ],
    difficultyLevels: {
      1: 'What does a single neuron compute? What is an activation function?',
      2: 'Walk me through backprop for a 2-layer network — what does the chain rule give you?',
      3: 'When does batch normalisation help and when can it hurt?',
      4: 'Why do vanilla RNNs suffer from vanishing gradients? How does LSTM solve it?',
      5: 'Design a real-time video classification system for 1M concurrent streams.',
    },
  },
  {
    id: 'ai_ml_systems', title: 'ML System Design',
    subtopics: [
      'Feature stores and real-time vs batch features',
      'Model serving: latency vs throughput',
      'Data pipelines and drift detection',
      'A/B testing and online evaluation',
      'Model monitoring and retraining triggers',
    ],
    difficultyLevels: {
      1: 'What is a feature store and why does one exist?',
      2: 'How do you serve a model with <50ms P99 latency?',
      3: 'How do you detect and respond to model drift in production?',
      4: 'Why is A/B testing for ML harder than for UI changes?',
      5: 'Design a recommendation system for 100M users, <100ms end-to-end.',
    },
  },
  {
    id: 'ai_generative', title: 'Generative AI & Diffusion',
    subtopics: [
      'VAE and latent space',
      'GANs: generator vs discriminator training',
      'Diffusion models: forward and reverse process',
      'Stable Diffusion and CLIP',
      'Evaluating generative models: FID, IS, human eval',
    ],
    difficultyLevels: {
      1: 'What is the difference between discriminative and generative models?',
      2: 'How does a GAN train — what is the min-max objective?',
      3: 'What is the forward and reverse diffusion process?',
      4: 'Why do GANs suffer from mode collapse and how do you mitigate it?',
      5: 'Design an image generation pipeline with <2s latency for 1M daily requests.',
    },
  },
];

/* ── QB object ─────────────────────────────────────────────────────────── */
const QB = (() => {
  let bank = { DSA: [], HLD: [], LLD: [], BEH: [], AI: [] };

  function _defaults() {
    return {
      DSA: DEFAULT_DSA.map(q => ({...q})),
      HLD: DEFAULT_HLD.map(q => ({...q})),
      LLD: DEFAULT_LLD.map(q => ({...q})),
      BEH: DEFAULT_BEH.map(q => ({...q})),
      AI:  DEFAULT_AI.map(q => ({...q})),
    };
  }

  function _load() {
    try {
      const raw = localStorage.getItem(QB_STORAGE_KEY);
      bank = raw ? JSON.parse(raw) : _defaults();
    } catch(e) {
      console.warn('[QB] load failed, using defaults', e);
      bank = _defaults();
    }
  }

  function _save() {
    try { localStorage.setItem(QB_STORAGE_KEY, JSON.stringify(bank)); }
    catch(e) { console.warn('[QB] save failed', e); }
  }

  function _find(id) {
    for (const round of Object.keys(bank)) {
      const idx = bank[round].findIndex(q => q.id === id);
      if (idx !== -1) return { round, idx, question: bank[round][idx] };
    }
    return null;
  }

  _load();

  return {
    get(round)       { return [...(bank[round] || [])]; },
    all()            { return { ...bank }; },
    add(round, q)    { const nq = {...q, id: q.id || _uid()}; bank[round].push(nq); _save(); return nq; },
    update(id, p)    { const f = _find(id); if (!f) return null; Object.assign(f.question, p); _save(); return f.question; },
    remove(id)       { const f = _find(id); if (!f) return false; bank[f.round].splice(f.idx, 1); _save(); return true; },
    reset()          { localStorage.removeItem(QB_STORAGE_KEY); _load(); },
    defaults:        { DSA: DEFAULT_DSA, HLD: DEFAULT_HLD, LLD: DEFAULT_LLD, BEH: DEFAULT_BEH, AI: DEFAULT_AI },

    /**
     * Parse a LeetCode problem URL + pasted description text into a DSA question object.
     * The interviewer pastes the problem text; we extract what we can.
     */
    parseLeetcode(url, pastedText) {
      // Extract problem number and title from URL: /problems/two-sum/ → "Two Sum"
      const slug  = (url.match(/problems\/([^/]+)/) || [])[1] || '';
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const num   = (url.match(/\/(\d+)\//) || [])[1] || '';

      return {
        id:          _uid(),
        title:       title || 'Custom LeetCode Problem',
        difficulty:  'medium',
        topic:       'Custom',
        timeMin:     45,
        source:      num ? `LeetCode ${num}` : 'LeetCode',
        sourceUrl:   url,
        description: pastedText.trim().substring(0, 2000),
        examples:    [],
        constraints: [],
        testCases:   [],
        starterCode: {
          python:     '# Write your solution here\npass',
          java:       '// Write your solution here',
          cpp:        '// Write your solution here',
          javascript: '// Write your solution here',
        },
        systemPrompt:
          `You are a FAANG SDE-3 interviewer. The candidate is solving: "${title}" (${url}).
Be an adversarial but fair interviewer: probe complexity claims, edge cases, and alternative approaches.
Keep each reply 1-3 sentences.`,
      };
    },
  };
})();
