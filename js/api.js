/**
 * api.js — Anthropic Claude API wrapper
 *
 * Features:
 *  - Rate limiting (CONFIG.API_MIN_GAP_MS between calls)
 *  - Pending-call lock to prevent concurrent requests
 *  - XSS-safe HTML escaping via sanitise()
 *  - API key loaded from window._ANTHROPIC_KEY → localStorage → prompt
 */

let _lastCall    = 0;   // timestamp of last API call
let _callPending = false;

/**
 * Resolve the Anthropic API key.
 * Priority: window._ANTHROPIC_KEY → localStorage → show setup modal.
 * @returns {string|null}
 */
function getApiKey() {
  if (window._ANTHROPIC_KEY) return window._ANTHROPIC_KEY;
  const stored = localStorage.getItem('anthropic_api_key');
  if (stored) return stored;
  return null;
}

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
  const apiKey = getApiKey();
  if (!apiKey) {
    showApiKeyModal();
    return null;
  }

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

    const res = await fetch(CONFIG.API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':                          'application/json',
        'x-api-key':                             apiKey,
        'anthropic-version':                     '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    _callPending = false;

    if (data?.error) {
      console.error('[API] Claude error:', data.error);
      // Bad key → re-show setup modal
      if (data.error.type === 'authentication_error') {
        localStorage.removeItem('anthropic_api_key');
        window._ANTHROPIC_KEY = null;
        showApiKeyModal('Invalid API key — please try again.');
      }
      return null;
    }

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
