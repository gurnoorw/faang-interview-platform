/**
 * history.js — Interview Session Store
 *
 * Persists completed interview sessions to localStorage under 'faang_sessions_v1'.
 * Each record stores scores, rubric breakdowns, communication stats, and metadata.
 * Maximum 100 sessions kept (oldest pruned automatically).
 *
 * Public API:
 *   HISTORY.add(record)          — save a new session
 *   HISTORY.getAll()             — all sessions, newest first
 *   HISTORY.getByRound(round)    — sessions for one round type, newest first
 *   HISTORY.count()              — total session count
 *   HISTORY.countByRound()       — { DSA:N, HLD:N, LLD:N, BEH:N, AI:N }
 *   HISTORY.sizeKb()             — approximate localStorage usage in KB
 *   HISTORY.clear()              — wipe all session data
 */

const HISTORY = (() => {
  const STORAGE_KEY = 'faang_sessions_v1';
  const MAX_SESSIONS = 100;

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : { sessions: [] };
      return Array.isArray(parsed.sessions) ? parsed.sessions : [];
    } catch (e) {
      console.warn('[HISTORY] load error', e);
      return [];
    }
  }

  function _save(sessions) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions }));
      return true;
    } catch (e) {
      console.warn('[HISTORY] save error — storage may be full', e);
      return false;
    }
  }

  return {
    /**
     * Add a completed session record.
     * @param {Object} record — see room.js endInterview() for schema
     */
    add(record) {
      const sessions = _load();
      sessions.push({
        ...record,
        id: record.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      });
      // Keep newest MAX_SESSIONS only
      const pruned = sessions.length > MAX_SESSIONS
        ? sessions.slice(sessions.length - MAX_SESSIONS)
        : sessions;
      _save(pruned);
    },

    /** All sessions, newest first. */
    getAll() {
      return _load().slice().reverse();
    },

    /** Sessions for a specific round type, newest first. */
    getByRound(round) {
      return _load().filter(s => s.round === round).reverse();
    },

    /** Total number of stored sessions. */
    count() {
      return _load().length;
    },

    /** Session counts broken down by round type. */
    countByRound() {
      const counts = { DSA: 0, HLD: 0, LLD: 0, BEH: 0, AI: 0 };
      _load().forEach(s => {
        if (counts[s.round] !== undefined) counts[s.round]++;
      });
      return counts;
    },

    /** Approximate localStorage usage for history data, in KB. */
    sizeKb() {
      const raw = localStorage.getItem(STORAGE_KEY) || '';
      return Math.round((raw.length / 1024) * 10) / 10;
    },

    /** Delete all session history. */
    clear() {
      localStorage.removeItem(STORAGE_KEY);
    },
  };
})();
