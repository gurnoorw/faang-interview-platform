/**
 * config.js — Central configuration for the FAANG Mock Interview Platform
 *
 * Change values here to tune the entire application.
 * Never hard-code these magic numbers elsewhere.
 */

const CONFIG = {
  /* ── Anthropic API ─────────────────────────────────────────────────── */
  API_URL:   'https://api.anthropic.com/v1/messages',
  API_MODEL: 'claude-sonnet-4-6',
  API_MAX_TOKENS: 900,              // default response budget

  /* ── Rate limiting ──────────────────────────────────────────────────── */
  API_MIN_GAP_MS:     900,          // min gap between consecutive API calls
  SILENCE_CHECK_MS:  30_000,        // how often to check for candidate silence
  SILENCE_THRESHOLD_S: 100,         // seconds before interviewer nudges
  CODE_WATCH_INTERVAL_MS: 9_000,    // live code review polling frequency

  /* ── Live evaluation ────────────────────────────────────────────────── */
  EVAL_INTERVAL_MS:  14_000,        // how often to update score bars
  HISTORY_CAP:       24,            // max conversation turns kept in memory

  /* ── AI Round levels ────────────────────────────────────────────────── */
  AI_CORRECT_TO_ADVANCE: 3,         // correct answers needed to move up a level
  AI_TOTAL_LEVELS:       5,

  /* ── Timers ─────────────────────────────────────────────────────────── */
  DEFAULT_TIME_MIN: 45,             // fallback if problem has no timeMin
};
