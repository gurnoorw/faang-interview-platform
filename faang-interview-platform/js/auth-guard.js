/**
 * auth-guard.js — Injected into the main app (index.html)
 *
 * On every page load:
 *  1. Check for JWT token in localStorage
 *  2. Verify token is not expired (client-side check)
 *  3. Check subscription status via API
 *  4. Redirect to login or payment page if needed
 *
 * Also patches callClaude() to route through our backend proxy
 * instead of calling Anthropic directly.
 */

const API_BASE = window.API_BASE || (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) || '';

/**
 * LOCAL DEV MODE: if no BACKEND_URL is configured, skip all auth/proxy logic.
 * api.js will handle direct Anthropic calls with the local API key.
 */
if (!API_BASE) {
  // No-op: window.callClaude already set correctly by api.js for direct calls.
  // Auth guard does nothing in local mode.
  console.info('[auth-guard] Local mode — no backend URL configured. Auth guard disabled.');
}

/* ── Token helpers ────────────────────────────────────────────────── */

function getToken()  { return localStorage.getItem('faang_token'); }
function getUser()   {
  try { return JSON.parse(localStorage.getItem('faang_user') || 'null'); }
  catch { return null; }
}
function clearAuth() {
  localStorage.removeItem('faang_token');
  localStorage.removeItem('faang_user');
}

/** Decode JWT payload (no verification — server verifies) */
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch { return null; }
}

/** True if the token's exp field is in the future */
function isTokenFresh(token) {
  const p = decodeToken(token);
  if (!p || !p.exp) return false;
  return p.exp * 1000 > Date.now();
}

/* ── Auth guard — runs immediately on script load (SaaS mode only) ── */

if (API_BASE) (async function authGuard() {
  const token = getToken();

  // No token → login
  if (!token || !isTokenFresh(token)) {
    clearAuth();
    window.location.href = 'pages/auth.html?mode=login';
    return;
  }

  // Check subscription status from server
  try {
    const res  = await fetch(`${API_BASE}/api/payment/status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Token rejected → re-login
      clearAuth();
      window.location.href = 'pages/auth.html?mode=login';
      return;
    }

    const data = await res.json();

    if (!data.isSubscribed) {
      // Authenticated but no active subscription → payment
      window.location.href = 'pages/payment.html';
      return;
    }

    // All good — show subscription badge in UI
    _showSubscriptionBadge(data);

  } catch (e) {
    // Network error — allow access (fail open, not fail closed for UX)
    console.warn('[auth-guard] Could not verify subscription:', e.message);
  }
})(); // end if(API_BASE) authGuard

/* ── Show user info + subscription badge ──────────────────────────── */

function _showSubscriptionBadge(subData) {
  const user = getUser();
  // Inject a small badge into the top bar if it exists
  const bar = document.getElementById('top-bar-user');
  if (!bar) return;
  bar.innerHTML =
    `<span style="font-size:0.7rem;color:#a78bfa">${user?.name || 'User'}</span>
     <span style="font-size:0.65rem;color:#22c55e;background:rgba(34,197,94,0.1);
       border:1px solid rgba(34,197,94,0.2);padding:1px 6px;border-radius:100px">
       Pro · ${subData.daysLeft}d left
     </span>
     <button onclick="logout()" style="background:none;border:none;color:#6868a0;
       cursor:pointer;font-size:0.7rem;font-family:var(--sans)">Log out</button>`;
}

function logout() {
  clearAuth();
  window.location.href = 'pages/auth.html?mode=login';
}

/* ── Override window.callClaude to use backend proxy ─────────────── */
/**
 * SaaS mode only: replace window.callClaude with backend proxy version.
 * api.js exposes callClaude on window.callClaude; all modules call
 * window.callClaude(...), so this override intercepts every AI call.
 * The Anthropic API key never reaches the browser.
 *
 * In local dev (no API_BASE), the original direct-Anthropic version remains.
 */
if (API_BASE) window.callClaude = async function(messages, systemPrompt, maxTokens) {
  const token = getToken();
  if (!token) {
    window.location.href = 'pages/auth.html?mode=login';
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}/api/claude/chat`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, system: systemPrompt, maxTokens }),
    });

    if (res.status === 401) {
      clearAuth();
      window.location.href = 'pages/auth.html?mode=login';
      return null;
    }
    if (res.status === 403) {
      window.location.href = 'pages/payment.html';
      return null;
    }

    const data = await res.json();
    if (data.error) {
      console.error('[proxy] API error:', data.error);
      return null;
    }

    return data?.content?.[0]?.text ?? null;

  } catch (e) {
    console.error('[proxy] fetch error:', e);
    return null;
  }
}; // end if(API_BASE) proxy override
