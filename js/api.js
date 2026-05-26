/**
 * api.js — Anthropic Claude API wrapper
 *
 * Features:
 *  - Rate limiting (CONFIG.API_MIN_GAP_MS between calls)
 *  - Pending-call lock to prevent concurrent requests
 *  - XSS-safe HTML escaping via sanitise()
 */

let _lastCall  = 0;   // timestamp of last API call
let _callPending = false;

/**
 * Call Claude with a conversation history and optional system prompt.
 * Returns the text of the first content block, or null on rate-limit / error.
 *
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} systemPrompt
 * @param {number} [maxTokens]
 * @returns {Promise<string|null>}
 */
async function callClaude(messages, systemPrompt, maxTokens = CONFIG.API_MAX_TOKENS) {
  const now = Date.now();

  // Enforce minimum gap between calls
  if (now - _lastCall < CONFIG.API_MIN_GAP_MS || _callPending) return null;

  _lastCall    = now;
  _callPending = true;

  try {
    const body = {
      model:      CONFIG.API_MODEL,
      max_tokens: maxTokens,
      messages,
    };
    if (systemPrompt) body.system = systemPrompt;

    const res  = await fetch(CONFIG.API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    const data = await res.json();
    _callPending = false;

    return data?.content?.[0]?.text ?? null;
  } catch (err) {
    console.error('[API] callClaude error:', err);
    _callPending = false;
    return null;
  }
}

/**
 * Sanitise a string for safe insertion into innerHTML.
 * Always prefer textContent for user-supplied text; use this only for
 * trusted-but-dynamic strings that need HTML rendering.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitise(str) {
  const el = document.createElement('div');
  el.textContent = String(str ?? '');
  return el.innerHTML;
}
