/**
 * progress.js — Performance Dashboard
 *
 * Renders the Progress screen: score trends, improvement deltas,
 * per-round breakdowns, universal skill comparisons, and session history.
 *
 * All data is read from HISTORY (history.js → localStorage).
 * No external chart libraries — everything is CSS-based.
 */

let _progTab = 'all';

/* ════════════════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════════════════ */

function renderProgress() {
  const all = HISTORY.getAll();
  _renderStatsBar(all);
  // Re-trigger the currently active tab
  const activeBtn = document.querySelector('.ptab.active');
  progTab(_progTab, activeBtn);
}

function progTab(round, btn) {
  _progTab = round;
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const content = document.getElementById('prog-content');
  if (!content) return;

  const all = HISTORY.getAll();

  if (all.length === 0) {
    content.innerHTML = `
      <div class="prog-empty">
        <div class="prog-empty-icon">🎯</div>
        <div class="prog-empty-title">No interviews recorded yet</div>
        <div class="prog-empty-sub">
          Complete your first mock interview to start tracking your progress.<br>
          Every session is automatically saved — nothing to configure.
        </div>
      </div>`;
    return;
  }

  content.innerHTML = '';
  if (round === 'all') {
    _renderOverview(all, content);
  } else {
    _renderRoundView(round, all, content);
  }
}

function clearHistory() {
  if (!confirm(`Clear all ${HISTORY.count()} session records? This cannot be undone.`)) return;
  HISTORY.clear();
  renderProgress();
  if (typeof showToast === 'function') showToast('History cleared.');
}

/* ════════════════════════════════════════════════════════════════════════
   STATS BAR (top of screen)
════════════════════════════════════════════════════════════════════════ */

function _renderStatsBar(sessions) {
  const el = document.getElementById('prog-session-count');
  if (el) {
    el.textContent = sessions.length
      ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} tracked · ${HISTORY.sizeKb()} KB`
      : 'No sessions yet';
  }

  const bar = document.getElementById('prog-stats-bar');
  if (!bar) return;

  const best = sessions.length ? Math.max(...sessions.map(s => s.overall || 0)) : 0;
  const avg  = sessions.length
    ? Math.round(sessions.reduce((s, x) => s + (x.overall || 0), 0) / sessions.length)
    : 0;

  // Recent trend: compare last 3 sessions to prior sessions
  let trend = '—';
  if (sessions.length >= 4) {
    const last3 = sessions.slice(0, 3).reduce((s, x) => s + (x.overall || 0), 0) / 3;
    const prev  = sessions.slice(3).reduce((s, x) => s + (x.overall || 0), 0) / (sessions.length - 3);
    const d = Math.round(last3 - prev);
    trend = d > 0 ? `↑ +${d}` : d < 0 ? `↓ ${d}` : '→ stable';
  }

  const counts    = HISTORY.countByRound();
  const roundBits = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([r, n]) =>
      `<span style="background:rgba(124,111,255,0.12);color:var(--acc2);
        padding:1px 7px;border-radius:4px;font-size:0.65rem;font-weight:600">${r} ${n}</span>`)
    .join(' ');

  bar.innerHTML = `
    <div class="prog-stat">
      <div class="prog-stat-n">${sessions.length}</div>
      <div class="prog-stat-l">Total Sessions</div>
    </div>
    <div class="prog-stat">
      <div class="prog-stat-n" style="color:${_scoreColor(best)}">${best || '—'}</div>
      <div class="prog-stat-l">Best Score</div>
    </div>
    <div class="prog-stat">
      <div class="prog-stat-n" style="color:${_scoreColor(avg)}">${avg || '—'}</div>
      <div class="prog-stat-l">Avg Score</div>
    </div>
    <div class="prog-stat">
      <div class="prog-stat-n" style="font-size:0.88rem;color:${
        trend.startsWith('↑') ? 'var(--grn)' : trend.startsWith('↓') ? 'var(--red)' : 'var(--mut)'
      }">${trend}</div>
      <div class="prog-stat-l">Recent Trend</div>
    </div>`;

  if (roundBits) {
    const row = document.createElement('div');
    row.style.cssText = 'grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;align-items:center';
    row.innerHTML = `<span style="font-size:0.62rem;color:var(--mut)">Rounds practiced:</span> ${roundBits}`;
    bar.appendChild(row);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   OVERVIEW TAB
════════════════════════════════════════════════════════════════════════ */

function _renderOverview(all, container) {
  container.appendChild(_makeUniversalSkills(all));
  container.appendChild(_makeRoundSummaries(all));
  container.appendChild(_makeSessionTable(all, 'All Sessions'));
}

/* ════════════════════════════════════════════════════════════════════════
   ROUND-SPECIFIC TAB
════════════════════════════════════════════════════════════════════════ */

function _renderRoundView(round, allSessions, container) {
  const sessions = allSessions.filter(s => s.round === round); // newest first

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="prog-empty">
        <div class="prog-empty-icon">📝</div>
        <div class="prog-empty-title">No ${round} sessions yet</div>
        <div class="prog-empty-sub">
          Complete a ${round} round to start tracking your ${round} progress.
        </div>
      </div>`;
    return;
  }

  // Improvement card (requires ≥2 sessions for comparison)
  if (sessions.length >= 2) {
    container.appendChild(_makeImprovementCard(sessions, round));
  }

  // Score trend chart
  container.appendChild(_makeScoreTrend(sessions, round));

  // Category comparison: latest vs previous average
  if (sessions.length >= 2) {
    container.appendChild(_makeCategoryComparison(sessions));
  } else {
    container.appendChild(_makeSingleSessionCategories(sessions[0]));
  }

  // Communication metrics over time for this round
  container.appendChild(_makeCommProgression(sessions, round));

  // Session table for this round
  container.appendChild(_makeSessionTable(sessions, `${round} Session History`));
}

/* ════════════════════════════════════════════════════════════════════════
   IMPROVEMENT CARD
════════════════════════════════════════════════════════════════════════ */

function _makeImprovementCard(sessions, round) {
  const latest   = sessions[0];
  const previous = sessions.slice(1);

  const prevAvgScore = _avg(previous.map(s => s.overall || 0));
  const scoreDelta   = (latest.overall || 0) - prevAvgScore;

  const latestComm = _getCommScore(latest);
  const prevComm   = _avg(previous.map(_getCommScore));
  const commDelta  = latestComm - prevComm;

  // Filler words: fewer is better (so positive delta = improvement)
  const latestFillers = latest.commStats?.fillerTotal || 0;
  const prevFillers   = _avg(previous.map(s => s.commStats?.fillerTotal || 0));
  const fillerDelta   = prevFillers - latestFillers; // positive = fewer fillers = good

  const latestCQs = latest.commStats?.clarifyingQs || 0;
  const prevCQs   = _avg(previous.map(s => s.commStats?.clarifyingQs || 0));
  const cqDelta   = latestCQs - prevCQs;

  // Composite improvement score: weighted combination
  const improvementScore = Math.round(
    scoreDelta * 0.65
    + commDelta * 0.15
    + Math.min(fillerDelta * 0.5, 10)   // cap filler contribution
    + cqDelta * 2 * 0.1
  );

  const sec  = _makeSection('📈', `${round} Improvement — Latest vs Previous ${previous.length} Session${previous.length > 1 ? 's' : ''}`);
  const body = sec.querySelector('.prog-sec-body');

  // Four metric cards
  const metricRow = document.createElement('div');
  metricRow.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:1rem';

  const metrics = [
    { label: 'Overall Score',     cur: latest.overall || 0,  prev: Math.round(prevAvgScore),  delta: Math.round(scoreDelta),  suffix: '/100', invert: false },
    { label: 'Communication',     cur: latestComm,           prev: Math.round(prevComm),      delta: Math.round(commDelta),   suffix: '/100', invert: false },
    { label: 'Filler Words',      cur: latestFillers,        prev: Math.round(prevFillers),   delta: Math.round(latestFillers - prevFillers), suffix: '',   invert: true  },
    { label: 'Clarifying Qs',     cur: latestCQs,            prev: Math.round(prevCQs * 10) / 10, delta: Math.round(cqDelta * 10) / 10, suffix: '', invert: false },
  ];

  metrics.forEach(m => {
    const good  = m.invert ? m.delta < 0 : m.delta > 0;
    const sign  = m.delta > 0 ? '+' : '';
    const dColor = good ? 'var(--grn)' : m.delta !== 0 ? 'var(--red)' : 'var(--mut)';

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg3);border:1px solid var(--bdr);border-radius:8px;padding:0.75rem';
    card.innerHTML = `
      <div style="font-size:0.58rem;color:var(--mut);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${m.label}</div>
      <div style="font-size:1.1rem;font-weight:700;color:${_scoreColor(m.cur)}">${m.cur}${m.suffix}</div>
      <div style="font-size:0.65rem;color:${dColor};margin-top:2px">
        ${sign}${m.delta}${m.suffix} vs avg ${m.prev}${m.suffix}
      </div>`;
    metricRow.appendChild(card);
  });
  body.appendChild(metricRow);

  // Composite score banner
  const isImproving = improvementScore > 5;
  const isDeclining = improvementScore < -5;
  const arrow       = isImproving ? '↑' : isDeclining ? '↓' : '→';
  const bannerColor = isImproving ? 'var(--grn)' : isDeclining ? 'var(--red)' : 'var(--mut)';

  const banner = document.createElement('div');
  banner.style.cssText = 'display:flex;align-items:center;gap:14px;padding:0.75rem 1rem;background:var(--bg3);border:1px solid var(--bdr);border-radius:8px';
  banner.innerHTML = `
    <div style="text-align:center;flex-shrink:0">
      <div style="font-size:2rem;font-weight:800;color:${bannerColor};line-height:1">
        ${improvementScore > 0 ? '+' : ''}${improvementScore}
      </div>
      <div style="font-size:0.58rem;color:var(--mut);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">
        Improvement Score
      </div>
    </div>
    <div style="font-size:0.72rem;color:var(--mut);line-height:1.7">
      ${arrow} ${Math.abs(improvementScore) > 5 ? 'Meaningful' : 'Marginal'}
      ${improvementScore >= 0 ? 'improvement' : 'decline'} across your last ${sessions.length} ${round} sessions.<br>
      <span style="font-size:0.62rem;opacity:0.7">
        Weighted: 65% overall score · 15% communication · 10% filler reduction · 10% clarifying questions
      </span>
    </div>`;
  body.appendChild(banner);

  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   SCORE TREND CHART
════════════════════════════════════════════════════════════════════════ */

function _makeScoreTrend(sessions, round) {
  const chron = [...sessions].reverse(); // chronological order for chart
  const sec   = _makeSection('📊', `${round} Score Trend (${sessions.length} session${sessions.length !== 1 ? 's' : ''})`);
  const body  = sec.querySelector('.prog-sec-body');

  // Bar chart
  const chart = document.createElement('div');
  chart.style.cssText = 'display:flex;align-items:flex-end;gap:5px;height:100px;padding:8px 0 2px';

  chron.forEach((s, i) => {
    const score    = s.overall || 0;
    const barH     = Math.max(4, Math.round((score / 100) * 80));
    const col      = _scoreColor(score);
    const isLatest = i === chron.length - 1;

    const col2 = document.createElement('div');
    col2.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:20px';
    col2.innerHTML = `
      <div style="font-size:8px;color:${isLatest ? col : 'var(--mut)'};font-weight:${isLatest ? '700' : '400'}">${score}</div>
      <div style="width:100%;background:${col};border-radius:3px 3px 0 0;height:${barH}px;
           opacity:${isLatest ? 1 : 0.5};transition:height 0.5s ease;
           ${isLatest ? 'box-shadow:0 0 8px ' + col + '55' : ''}"
           title="${s.problem?.title || ''} · ${_fullDate(s.ts)}"></div>
      <div style="font-size:7px;color:var(--mut);white-space:nowrap;overflow:hidden;
           max-width:36px;text-overflow:ellipsis">${_shortDate(s.ts)}</div>`;
    chart.appendChild(col2);
  });

  body.appendChild(chart);

  // Legend
  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;gap:12px;margin-top:6px;flex-wrap:wrap';
  for (const [label, score, color] of [
    ['Strong Hire', 75, 'var(--grn)'],
    ['Hire',        55, 'var(--amb)'],
    ['No Hire',      0, 'var(--red)'],
  ]) {
    legend.innerHTML += `
      <span style="font-size:0.63rem;color:${color};display:flex;align-items:center;gap:4px">
        <span style="width:10px;height:2px;background:${color};display:inline-block;border-radius:1px"></span>
        ${label}: ${score}+
      </span>`;
  }
  body.appendChild(legend);

  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   CATEGORY COMPARISON (latest vs previous average)
════════════════════════════════════════════════════════════════════════ */

function _makeCategoryComparison(sessions) {
  const latest   = sessions[0];
  const previous = sessions.slice(1);

  const sec  = _makeSection('📋', 'Category Breakdown — Latest vs Previous Average');
  const body = sec.querySelector('.prog-sec-body');

  const latestCats = latest.categories || [];
  if (latestCats.length === 0) {
    body.innerHTML = '<div style="color:var(--mut);font-size:0.72rem">No category data in latest session.</div>';
    return sec;
  }

  latestCats.forEach(cat => {
    const prevScores = previous
      .map(s => (s.categories || []).find(c => c.name === cat.name)?.score)
      .filter(s => s !== undefined);
    const prevAvg = prevScores.length ? Math.round(_avg(prevScores)) : null;
    const delta   = prevAvg !== null ? (cat.score || 0) - prevAvg : null;

    const row = document.createElement('div');
    row.className = 'cat-comp-row';

    // Name + delta + score header
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px';
    nameRow.innerHTML = `
      <div style="font-size:0.72rem;font-weight:600">${sanitise(cat.name)}</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${delta !== null
          ? `<span class="${_improvClass(delta)}">${delta > 0 ? '+' : ''}${delta}</span>`
          : ''}
        <span style="font-size:0.72rem;font-weight:700;color:${_scoreColor(cat.score || 0)}">${cat.score}/100</span>
      </div>`;

    // Bars
    const barsWrap = document.createElement('div');
    barsWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px';

    // Latest bar
    barsWrap.innerHTML += `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="min-width:50px;text-align:right;font-size:0.6rem;color:var(--mut)">Latest</div>
        <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${cat.score || 0}%;background:${_scoreColor(cat.score || 0)};
               border-radius:3px;transition:width 0.5s ease"></div>
        </div>
      </div>`;

    // Previous average bar (if available)
    if (prevAvg !== null) {
      barsWrap.innerHTML += `
        <div style="display:flex;align-items:center;gap:8px">
          <div style="min-width:50px;text-align:right;font-size:0.6rem;color:rgba(255,255,255,0.25)">Prev avg</div>
          <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${prevAvg}%;background:rgba(124,111,255,0.4);
                 border-radius:3px;transition:width 0.5s ease"></div>
          </div>
          <div style="font-size:0.6rem;color:rgba(255,255,255,0.3);min-width:28px">${prevAvg}</div>
        </div>`;
    }

    row.appendChild(nameRow);
    row.appendChild(barsWrap);
    body.appendChild(row);
  });

  return sec;
}

function _makeSingleSessionCategories(session) {
  const sec  = _makeSection('📋', 'Category Breakdown');
  const body = sec.querySelector('.prog-sec-body');
  (session.categories || []).forEach(cat => {
    const score = cat.score || 0;
    body.innerHTML += `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:0.72rem;font-weight:600">${sanitise(cat.name)}</span>
          <span style="font-size:0.72rem;font-weight:700;color:${_scoreColor(score)}">${score}/100</span>
        </div>
        <div style="height:5px;background:var(--bg4);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${score}%;background:${_scoreColor(score)};
               border-radius:3px;transition:width 0.5s ease"></div>
        </div>
      </div>`;
  });
  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   COMMUNICATION METRICS OVER TIME (per round)
════════════════════════════════════════════════════════════════════════ */

function _makeCommProgression(sessions, round) {
  const sec  = _makeSection('💬', `${round} — Communication Metrics Over Time`);
  const body = sec.querySelector('.prog-sec-body');

  if (sessions.length < 2) {
    body.innerHTML = '<div style="color:var(--mut);font-size:0.72rem">Complete at least 2 sessions to see communication trends.</div>';
    return sec;
  }

  const chron = [...sessions].reverse();

  const metrics = [
    { label: 'Filler Words',          key: s => s.commStats?.fillerTotal  || 0, good: 'lower',  color: 'var(--amb)' },
    { label: 'Clarifying Questions',  key: s => s.commStats?.clarifyingQs || 0, good: 'higher', color: 'var(--grn)' },
    { label: 'Voice Words Spoken',    key: s => s.commStats?.voiceWords   || 0, good: 'higher', color: '#60a5fa'     },
    { label: 'Think-Aloud Bursts',   key: s => s.commStats?.thinkAloudBursts || 0, good: 'higher', color: 'var(--acc2)' },
  ];

  metrics.forEach(m => {
    const vals  = chron.map(m.key);
    const maxV  = Math.max(...vals, 1);
    const first = vals[0];
    const last  = vals[vals.length - 1];
    const trend = m.good === 'lower' ? first - last : last - first;

    const trendText  = trend > 0 ? '↑ improving' : trend < 0 ? '↓ declining' : '→ stable';
    const trendColor = trend > 0 ? 'var(--grn)' : trend < 0 ? 'var(--red)' : 'var(--mut)';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:14px';
    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:0.68rem;color:var(--mut)">${m.label}</span>
        <span style="font-size:0.65rem;color:${trendColor};font-weight:600">${trendText}</span>
      </div>
      <div style="display:flex;align-items:flex-end;gap:3px;height:44px">
        ${vals.map((v, i) => {
          const h      = Math.max(2, Math.round((v / maxV) * 36));
          const isLast = i === vals.length - 1;
          return `<div style="flex:1;height:${h}px;background:${m.color};border-radius:2px;
                   opacity:${isLast ? 1 : 0.4};min-width:4px;
                   ${isLast ? 'box-shadow:0 0 4px ' + m.color + '66' : ''}"
                   title="${_shortDate(chron[i].ts)}: ${v}"></div>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:3px">
        <span style="font-size:0.6rem;color:var(--mut)">${_shortDate(chron[0].ts)}: ${first}</span>
        <span style="font-size:0.6rem;color:${m.color};font-weight:600">Latest: ${last}</span>
      </div>`;
    body.appendChild(wrap);
  });

  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   UNIVERSAL SKILLS — cross-round comparison
════════════════════════════════════════════════════════════════════════ */

function _makeUniversalSkills(all) {
  const sec  = _makeSection('🌐', 'Universal Skills — Across All Rounds');
  const body = sec.querySelector('.prog-sec-body');

  if (all.length < 2) {
    body.innerHTML = '<div style="color:var(--mut);font-size:0.72rem">Complete at least 2 sessions across any rounds to see cross-round skill trends.</div>';
    return sec;
  }

  // Split into recent (last 3) vs older for trend badges
  const last3 = all.slice(0, Math.min(3, all.length));
  const rest  = all.slice(3);

  function trendBadge(fn, invert = false) {
    if (rest.length === 0) return '';
    const recent = _avg(last3.map(fn));
    const older  = _avg(rest.map(fn));
    const d      = Math.round((recent - older) * 10) / 10;
    if (Math.abs(d) < 0.5) return '<span style="color:var(--mut);font-size:0.63rem">→ stable</span>';
    const good = invert ? d < 0 : d > 0;
    return `<span style="color:${good ? 'var(--grn)' : 'var(--red)'};font-size:0.63rem">${d > 0 ? '↑ +' : '↓ '}${Math.abs(d)}</span>`;
  }

  const avgComm    = Math.round(_avg(all.map(_getCommScore)));
  const avgAdapt   = Math.round(_avg(all.map(_getAdaptScore)));
  const avgDepth   = Math.round(_avg(all.map(_getDepthScore)));
  const avgFillers = Math.round(_avg(all.map(s => s.commStats?.fillerTotal  || 0)));
  const avgCQs     = Math.round(_avg(all.map(s => s.commStats?.clarifyingQs || 0)) * 10) / 10;
  const avgOverall = Math.round(_avg(all.map(s => s.overall || 0)));

  const cards = [
    { title: 'Avg Overall Score',    val: `${avgOverall}/100`, trend: trendBadge(s => s.overall || 0),                              color: _scoreColor(avgOverall) },
    { title: 'Avg Communication',    val: `${avgComm}/100`,    trend: trendBadge(_getCommScore),                                    color: _scoreColor(avgComm) },
    { title: 'Avg Deep Thinking',    val: `${avgDepth}/100`,   trend: trendBadge(_getDepthScore),                                   color: _scoreColor(avgDepth) },
    { title: 'Avg Adaptability',     val: `${avgAdapt}/100`,   trend: trendBadge(_getAdaptScore),                                   color: _scoreColor(avgAdapt) },
    { title: 'Avg Filler Words',     val: `${avgFillers}/session`, trend: trendBadge(s => s.commStats?.fillerTotal  || 0, true),   color: avgFillers < 5 ? 'var(--grn)' : avgFillers < 15 ? 'var(--amb)' : 'var(--red)' },
    { title: 'Avg Clarifying Qs',   val: `${avgCQs}/session`, trend: trendBadge(s => s.commStats?.clarifyingQs || 0),              color: avgCQs >= 3 ? 'var(--grn)' : avgCQs >= 1 ? 'var(--amb)' : 'var(--red)' },
  ];

  const grid = document.createElement('div');
  grid.className = 'univ-grid';
  cards.forEach(c => {
    const card = document.createElement('div');
    card.className = 'univ-card';
    card.innerHTML = `
      <div class="univ-card-title">${c.title}</div>
      <div class="univ-card-val" style="color:${c.color}">${c.val}</div>
      <div class="univ-card-trend">${c.trend}</div>`;
    grid.appendChild(card);
  });
  body.appendChild(grid);

  // Communication score broken down by round type
  const rounds      = ['DSA', 'HLD', 'LLD', 'BEH', 'AI'];
  const commByRound = rounds
    .map(r => ({
      r,
      avg:   Math.round(_avg(all.filter(s => s.round === r).map(_getCommScore))),
      count: all.filter(s => s.round === r).length,
    }))
    .filter(x => x.count > 0 && x.avg > 0);

  if (commByRound.length > 1) {
    const cr = document.createElement('div');
    cr.style.cssText = 'margin-top:1.1rem';
    cr.innerHTML = '<div style="font-size:0.63rem;color:var(--mut);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Communication Score by Round</div>';
    commByRound.forEach(({ r, avg, count }) => {
      cr.innerHTML += `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="min-width:38px;font-size:0.68rem;color:var(--mut)">${r}</div>
          <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${avg}%;background:${_scoreColor(avg)};
                 border-radius:3px;transition:width 0.5s ease"></div>
          </div>
          <div style="font-size:0.68rem;font-weight:700;color:${_scoreColor(avg)};min-width:32px">${avg}</div>
          <div style="font-size:0.6rem;color:var(--mut)">${count}×</div>
        </div>`;
    });
    body.appendChild(cr);
  }

  // Deep thinking comparison across rounds
  const depthByRound = rounds
    .map(r => ({
      r,
      avg:   Math.round(_avg(all.filter(s => s.round === r).map(_getDepthScore))),
      count: all.filter(s => s.round === r).length,
    }))
    .filter(x => x.count > 0 && x.avg > 0);

  if (depthByRound.length > 1) {
    const dr = document.createElement('div');
    dr.style.cssText = 'margin-top:1rem';
    dr.innerHTML = '<div style="font-size:0.63rem;color:var(--mut);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Deep Thinking Score by Round</div>';
    depthByRound.forEach(({ r, avg, count }) => {
      dr.innerHTML += `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="min-width:38px;font-size:0.68rem;color:var(--mut)">${r}</div>
          <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${avg}%;background:${_scoreColor(avg)};
                 border-radius:3px;transition:width 0.5s ease"></div>
          </div>
          <div style="font-size:0.68rem;font-weight:700;color:${_scoreColor(avg)};min-width:32px">${avg}</div>
          <div style="font-size:0.6rem;color:var(--mut)">${count}×</div>
        </div>`;
    });
    body.appendChild(dr);
  }

  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   ROUND SUMMARIES (overview tab cards)
════════════════════════════════════════════════════════════════════════ */

function _makeRoundSummaries(all) {
  const sec  = _makeSection('🎯', 'Performance by Round Type');
  const body = sec.querySelector('.prog-sec-body');

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px';

  ['DSA', 'HLD', 'LLD', 'BEH', 'AI'].forEach(r => {
    const sessions = all.filter(s => s.round === r);
    const card     = document.createElement('div');
    card.style.cssText = 'background:var(--bg3);border:1px solid var(--bdr);border-radius:8px;padding:0.75rem;cursor:pointer;transition:border-color 0.15s';

    if (sessions.length === 0) {
      card.style.opacity = '0.45';
      card.style.cursor  = 'default';
      card.innerHTML = `
        <div style="font-size:0.75rem;font-weight:700;color:var(--mut)">${r}</div>
        <div style="font-size:0.65rem;color:var(--mut);margin-top:4px">No sessions yet</div>`;
    } else {
      const best  = Math.max(...sessions.map(s => s.overall || 0));
      const avg   = Math.round(_avg(sessions.map(s => s.overall || 0)));
      const last  = sessions[0]; // newest first
      const prev  = sessions[1];
      const trend = prev ? (last.overall || 0) - (prev.overall || 0) : null;
      const trendHtml = trend !== null
        ? `<span style="font-size:0.63rem;color:${trend > 0 ? 'var(--grn)' : trend < 0 ? 'var(--red)' : 'var(--mut)'}">
             ${trend > 0 ? '↑ +' : trend < 0 ? '↓ ' : '→ '}${Math.abs(trend)}
           </span>`
        : '';

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-size:0.75rem;font-weight:700">${r}</div>
          <div style="font-size:0.6rem;color:var(--mut)">${sessions.length}×</div>
        </div>
        <div style="font-size:1.3rem;font-weight:700;color:${_scoreColor(avg)}">${avg}</div>
        <div style="font-size:0.6rem;color:var(--mut)">avg · best ${best}</div>
        <div style="margin-top:3px">${trendHtml}</div>
        <div style="height:3px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-top:6px">
          <div style="height:100%;width:${avg}%;background:${_scoreColor(avg)};border-radius:2px"></div>
        </div>`;

      card.onmouseenter = () => card.style.borderColor = 'var(--acc)';
      card.onmouseleave = () => card.style.borderColor = 'var(--bdr)';
      card.onclick = () => {
        const btn = [...document.querySelectorAll('.ptab')].find(b => b.textContent.trim().includes(r));
        if (btn) progTab(r, btn);
      };
    }

    grid.appendChild(card);
  });

  body.appendChild(grid);
  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   SESSION HISTORY TABLE
════════════════════════════════════════════════════════════════════════ */

function _makeSessionTable(sessions, title = 'Session History') {
  const sec  = _makeSection('📝', `${title} (${sessions.length})`);
  const body = sec.querySelector('.prog-sec-body');

  if (sessions.length === 0) {
    body.innerHTML = '<div style="color:var(--mut);font-size:0.72rem">No sessions.</div>';
    return sec;
  }

  const table = document.createElement('table');
  table.className = 'sess-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Round</th>
        <th>Problem</th>
        <th>Score</th>
        <th>Verdict</th>
        <th>Dur.</th>
        <th>SDE-3 Bar</th>
      </tr>
    </thead>`;

  const tbody = document.createElement('tbody');
  sessions.forEach(s => {
    const score = s.overall || 0;
    const vicon = (s.verdict?.includes('Strong Hire') || s.verdict === 'Hire') ? '✅'
                : s.verdict?.includes('No Hire')                                ? '❌' : '🟡';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--mut)">${_fullDate(s.ts)}</td>
      <td>
        <span style="background:rgba(124,111,255,0.12);color:var(--acc2);
          padding:1px 7px;border-radius:4px;font-size:0.65rem;font-weight:600">
          ${sanitise(s.round)}
        </span>
      </td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${sanitise(s.problem?.title || '')}">
        ${sanitise(s.problem?.title || '—')}
        ${s.problem?.difficulty
          ? `<span style="font-size:0.6rem;color:var(--mut)"> · ${s.problem.difficulty}</span>`
          : ''}
      </td>
      <td style="font-weight:700;color:${_scoreColor(score)}">${score}</td>
      <td>${vicon} <span style="font-size:0.68rem">${sanitise(s.verdict || '—')}</span></td>
      <td style="color:var(--mut)">${s.durationMin ? s.durationMin + 'm' : '—'}</td>
      <td style="font-size:0.65rem;color:var(--mut)">${sanitise(s.sde3Level || '—')}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   PREVIOUS-SESSION COMPARISON  (shown at bottom of feedback screen)
════════════════════════════════════════════════════════════════════════ */

/**
 * Render a "vs your history" comparison section at the bottom of the
 * feedback report. Called from feedback.js with the PREVIOUS sessions
 * (before the current one was saved).
 */
function renderHistoryComparison(fb, round, prevSessions) {
  const container = document.getElementById('fb-body');
  if (!container || !prevSessions || prevSessions.length === 0) return;

  const sec  = document.createElement('div');
  sec.className = 'fb-section';
  sec.innerHTML = `<div class="fb-sec-hdr"><i class="ti ti-history" aria-hidden="true"></i>Compared to Your ${round} History (${prevSessions.length} previous session${prevSessions.length !== 1 ? 's' : ''})</div>`;
  const body = document.createElement('div');
  body.className = 'fb-sec-body';

  const prevAvg   = Math.round(_avg(prevSessions.map(s => s.overall || 0)));
  const best      = Math.max(...prevSessions.map(s => s.overall || 0));
  const curScore  = fb.overall || 0;
  const scoreDelta = curScore - prevAvg;

  // Quick summary row
  const summaryRow = document.createElement('div');
  summaryRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px';

  const chips = [
    { l: 'Your score now',   v: `${curScore}`,     color: _scoreColor(curScore) },
    { l: 'Previous avg',     v: `${prevAvg}`,       color: _scoreColor(prevAvg) },
    { l: 'Your personal best', v: `${best}`,       color: _scoreColor(best) },
    { l: 'Delta',            v: `${scoreDelta > 0 ? '+' : ''}${scoreDelta}`,
      color: scoreDelta > 0 ? 'var(--grn)' : scoreDelta < 0 ? 'var(--red)' : 'var(--mut)' },
  ];
  chips.forEach(c => {
    summaryRow.innerHTML += `
      <div style="flex:1;min-width:100px;background:var(--bg3);border:1px solid var(--bdr);
           border-radius:8px;padding:8px 12px">
        <div style="font-size:0.58rem;color:var(--mut);text-transform:uppercase;letter-spacing:0.5px">${c.l}</div>
        <div style="font-size:1.1rem;font-weight:700;color:${c.color}">${c.v}</div>
      </div>`;
  });
  body.appendChild(summaryRow);

  // Category-level comparison
  const curCats  = fb.categories || [];
  const hasPrevCats = prevSessions.some(s => (s.categories || []).length > 0);

  if (hasPrevCats && curCats.length > 0) {
    const catTitle = document.createElement('div');
    catTitle.style.cssText = 'font-size:0.65rem;color:var(--mut);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px';
    catTitle.textContent   = 'Category deltas vs your previous averages';
    body.appendChild(catTitle);

    curCats.forEach(cat => {
      const prevScores = prevSessions
        .map(s => (s.categories || []).find(c => c.name === cat.name)?.score)
        .filter(s => s !== undefined);
      if (prevScores.length === 0) return;

      const prevAvgCat = Math.round(_avg(prevScores));
      const delta      = (cat.score || 0) - prevAvgCat;
      const sign       = delta > 0 ? '+' : '';
      const dColor     = delta > 0 ? 'var(--grn)' : delta < 0 ? 'var(--red)' : 'var(--mut)';

      body.innerHTML += `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <div style="flex:1;font-size:0.68rem;color:var(--mut)">${sanitise(cat.name)}</div>
          <div style="font-size:0.68rem;font-weight:700;color:${_scoreColor(cat.score || 0)};min-width:40px;text-align:right">${cat.score}</div>
          <div style="font-size:0.68rem;font-weight:700;color:${dColor};min-width:36px;text-align:right">${sign}${delta}</div>
        </div>`;
    });
  }

  // Progress CTA
  const cta = document.createElement('div');
  cta.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)';
  cta.innerHTML = `
    <button onclick="goProgress()"
            style="background:rgba(124,111,255,0.15);color:var(--acc2);border:1px solid rgba(124,111,255,0.3);
                   border-radius:8px;padding:6px 16px;font-size:0.72rem;font-weight:600;cursor:pointer;
                   transition:background 0.15s"
            onmouseover="this.style.background='rgba(124,111,255,0.25)'"
            onmouseout="this.style.background='rgba(124,111,255,0.15)'">
      📊 View full progress dashboard
    </button>`;
  body.appendChild(cta);

  sec.appendChild(body);
  container.appendChild(sec);
}

/* ════════════════════════════════════════════════════════════════════════
   SECTION BUILDER
════════════════════════════════════════════════════════════════════════ */

function _makeSection(icon, title) {
  const sec  = document.createElement('div');
  sec.className = 'prog-section';
  sec.innerHTML = `<div class="prog-sec-hdr">${icon} <span>${sanitise(title)}</span></div>`;
  const body = document.createElement('div');
  body.className = 'prog-sec-body';
  sec.appendChild(body);
  return sec;
}

/* ════════════════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════════════════ */

function _avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + (x || 0), 0) / arr.length;
}

function _scoreColor(score) {
  return score >= 75 ? 'var(--grn)' : score >= 55 ? 'var(--amb)' : 'var(--red)';
}

function _improvClass(delta) {
  return delta > 0
    ? 'impr-badge impr-up'
    : delta < 0
    ? 'impr-badge impr-down'
    : 'impr-badge impr-flat';
}

/** Extract communication dimension score from a session record. */
function _getCommScore(session) {
  if (!session?.categories) return 0;
  const cat = session.categories.find(c =>
    /commun|think.aloud|teaching/i.test(c.name)
  );
  return cat?.score || 0;
}

/** Extract adaptability/under-pressure score. */
function _getAdaptScore(session) {
  if (!session?.categories) return 0;
  const cat = session.categories.find(c =>
    /adapt|pressure|adversi/i.test(c.name)
  );
  return cat?.score || 0;
}

/**
 * Extract "deep thinking" dimension — the primary analytical/algorithmic
 * category that best represents cognitive depth for each round type.
 *   DSA  → Algorithm Selection & Intuition
 *   HLD  → Trade-off Articulation
 *   LLD  → OOP / SOLID or Design Patterns
 *   BEH  → SDE-3 Ownership Signals
 *   AI   → Mathematical Depth
 */
function _getDepthScore(session) {
  if (!session?.categories) return 0;
  const cat = session.categories.find(c =>
    /algorithm|trade.off|solid|mathemat|ownership|design pattern/i.test(c.name)
  );
  return cat?.score || 0;
}

function _shortDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function _fullDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}
