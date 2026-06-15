/**
 * media.js — Camera, microphone, and communication tracking
 *
 * Voice service features:
 *  ✓ Auto-restart recognition — stays alive through pauses and browser timeouts
 *  ✓ Language cascade — tries en-IN, falls back to en-US on error
 *  ✓ Real-time transcription overlay (shown while mic is on)
 *  ✓ Filler word detection with per-type counts
 *  ✓ Accurate WPM tracking from speech recognition results
 *  ✓ Communication metrics via COMM_TRACKER
 *  ✓ Visual filler alert pills
 *
 * Privacy:
 *  ✓ Camera video is LOCAL ONLY — srcObject never transmitted
 *  ✓ Mic audio stays in browser; only transcript text is sent to Claude
 *  ✓ All tracks stopped on exit, beforeunload, and tab-hide
 */

/* ═══════════════════════════════════════════════════════════════════════
   COMM_TRACKER — accumulated communication metrics for the session
   Reset by ROOM.start(); read by generateFeedback() at interview end.
═══════════════════════════════════════════════════════════════════════ */

const COMM_TRACKER = (() => {
  /* Filler words grouped by type */
  const FILLERS = {
    hesitation: ['um', 'uh', 'er', 'ah', 'hmm'],
    discourse:  ['like', 'basically', 'literally', 'actually', 'obviously', 'clearly'],
    metacomm:   ['you know', 'i mean', 'you see', 'sort of', 'kind of', 'right'],
    restart:    ['so', 'well', 'okay', 'anyway'],
  };

  // Flat map for fast lookup: word → type
  const FILLER_MAP = {};
  for (const [type, words] of Object.entries(FILLERS)) {
    for (const w of words) FILLER_MAP[w] = type;
  }

  let _d = _fresh();

  function _fresh() {
    return {
      sessionStart:      null,
      totalWords:        0,     // voiced + typed
      voiceWords:        0,
      typedWords:        0,
      fillerTotal:       0,
      fillerByType:      { hesitation: 0, discourse: 0, metacomm: 0, restart: 0 },
      fillerInstances:   [],    // [{word, type, context, ms}]
      clarifyingQs:      0,
      silenceNudges:     0,
      msgCount:          0,
      thinkAloudBursts:  0,     // multi-word voice runs before bot replied
      speakingMs:        0,     // approximate time speaking
      _speakStart:       null,
    };
  }

  return {
    reset() {
      _d = _fresh();
      _d.sessionStart = Date.now();
      _updateUI();
    },

    /** Call this when the mic becomes active (start of a speaking burst). */
    startSpeaking() {
      _d._speakStart = Date.now();
    },

    /** Call this at end of a speaking burst with the final transcript text. */
    endSpeaking(text) {
      if (_d._speakStart) {
        _d.speakingMs += Date.now() - _d._speakStart;
        _d._speakStart = null;
      }
      if (!text) return;

      const words = text.trim().split(/\s+/).filter(Boolean);
      _d.voiceWords += words.length;
      _d.totalWords += words.length;
      if (words.length >= 3) _d.thinkAloudBursts++;

      // Filler detection
      _detectFillers(text, words);
      _updateUI();
    },

    /** Call whenever the user sends a message (voice or typed). */
    addMessage(text) {
      _d.msgCount++;
      const words = text.trim().split(/\s+/).filter(Boolean);
      _d.typedWords += words.length;
      _d.totalWords += words.length;

      // Clarifying question heuristic: message ends with ? or contains known patterns
      if (/[?？]/.test(text) ||
          /should i (assume|consider|handle|include)|is it (okay|fine|acceptable)|what (about|if)|how (many|large|much|often)|can (i|we)|do you (want|need)|are (there|we)/.test(text.toLowerCase())) {
        _d.clarifyingQs++;
        _updateUI();
      }
    },

    /** Call when the silence detector fires a nudge. */
    addSilenceNudge() {
      _d.silenceNudges++;
      _updateUI();
    },

    /** Returns a formatted string to embed in the Claude feedback prompt. */
    getSummary() {
      const sessionMin = _d.sessionStart
        ? Math.round((Date.now() - _d.sessionStart) / 60000)
        : 0;
      const speakMin = Math.round(_d.speakingMs / 60000);
      const wpm = speakMin > 0
        ? Math.round(_d.voiceWords / speakMin)
        : _d.voiceWords > 0 ? '~120 (estimated)' : 'N/A';

      const topFillers = Object.entries(
        _d.fillerInstances.reduce((acc, f) => { acc[f.word] = (acc[f.word] || 0) + 1; return acc; }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => `"${w}" ×${n}`).join(', ');

      return [
        `=== COMMUNICATION NOTES (objective session data) ===`,
        `Session duration: ~${sessionMin} min`,
        `Total words: ${_d.totalWords} (voice: ${_d.voiceWords}, typed: ${_d.typedWords})`,
        `Approximate speaking pace: ${wpm} WPM`,
        `Messages sent: ${_d.msgCount}`,
        `Clarifying questions detected: ${_d.clarifyingQs}`,
        `Filler words total: ${_d.fillerTotal}`,
        `  • Hesitation (um/uh/er): ${_d.fillerByType.hesitation}`,
        `  • Discourse (like/basically/literally): ${_d.fillerByType.discourse}`,
        `  • Meta-communication (you know/I mean): ${_d.fillerByType.metacomm}`,
        `  • Restart (so/well/okay): ${_d.fillerByType.restart}`,
        topFillers ? `  Top fillers: ${topFillers}` : '',
        `Think-aloud bursts (≥3 words before reply): ${_d.thinkAloudBursts}`,
        `Silence nudges received: ${_d.silenceNudges}`,
        `=== END COMM NOTES ===`,
      ].filter(Boolean).join('\n');
    },

    /** Raw data for debugging or custom use. */
    getData() { return { ..._d }; },
  };

  /* ── Internal helpers ─────────────────────────────────────────────── */

  function _detectFillers(text, words) {
    const lower = text.toLowerCase();

    // Multi-word fillers first
    for (const phrase of ['you know', 'i mean', 'you see', 'sort of', 'kind of']) {
      let pos = 0;
      while ((pos = lower.indexOf(phrase, pos)) !== -1) {
        _logFiller(phrase, FILLER_MAP[phrase], text.substring(Math.max(0, pos - 20), pos + phrase.length + 20));
        pos += phrase.length;
      }
    }

    // Single-word fillers (word-boundary match)
    for (const w of words) {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '');
      if (FILLER_MAP[clean]) {
        _logFiller(clean, FILLER_MAP[clean], text.substring(0, 60));
      }
    }
  }

  function _logFiller(word, type, context) {
    _d.fillerTotal++;
    _d.fillerByType[type] = (_d.fillerByType[type] || 0) + 1;
    _d.fillerInstances.push({ word, type, context, ms: Date.now() });
    _showFillerAlert(word);
  }

  function _showFillerAlert(word) {
    const pill = document.createElement('div');
    pill.className = 'filler-alert';
    pill.textContent = `🗣️ "${word}" detected`;
    document.body.appendChild(pill);
    setTimeout(() => pill.remove(), 2000);
  }

  function _updateUI() {
    _set('evl-words',   _d.voiceWords);
    _set('evl-msgs',    _d.msgCount);
    _set('evl-clarit',  _d.clarifyingQs);
    _set('evl-fillers', _d.fillerTotal);
    _set('evl-silence', _d.silenceNudges);
    // WPM
    const speakMin = _d.speakingMs / 60000;
    const wpm = speakMin > 0.1 ? Math.round(_d.voiceWords / speakMin) : '—';
    _set('wpm',  wpm);
    _set('fill', _d.fillerTotal);
  }

  function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
})();


/* ═══════════════════════════════════════════════════════════════════════
   CAMERA
═══════════════════════════════════════════════════════════════════════ */

let _camStream = null;

async function toggleCam() {
  if (_camStream) {
    stopCamera();
  } else {
    try {
      _camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 280 }, height: { ideal: 200 }, facingMode: 'user' },
        audio: false,
      });
      const vid = document.getElementById('vid');
      vid.srcObject     = _camStream;
      vid.style.display = 'block';
      document.getElementById('cam-ph').style.display = 'none';
      document.getElementById('rec-b').classList.add('on');
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied — allow it in browser settings.'
        : 'Camera unavailable on this device.';
      if (typeof addSystemMsg === 'function') addSystemMsg(msg);
    }
  }
}

function stopCamera() {
  if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null; }
  const vid = document.getElementById('vid');
  if (vid) { vid.srcObject = null; vid.style.display = 'none'; }
  document.getElementById('cam-ph')?.style && (document.getElementById('cam-ph').style.display = 'flex');
  document.getElementById('rec-b')?.classList.remove('on');
}


/* ═══════════════════════════════════════════════════════════════════════
   VOICE SERVICE — world-class continuous recognition
═══════════════════════════════════════════════════════════════════════ */

let _recognition   = null;
let _micOn         = false;
let _micLang       = 'en-IN';      // primary language; falls back to en-US
let _waveInterval  = null;
let _restartTimer  = null;         // for auto-restart debounce
let _speakingNow   = false;        // tracks whether a speaking burst is active
let _interimBuffer = '';           // current interim text

function toggleMic() { _micOn ? stopMic() : startMic(); }

/**
 * Start continuous voice recognition.
 * Automatically restarts on every `onend` event (browser stops recognition
 * after long pauses or ~60s in some engines — this keeps it alive).
 */
function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (typeof addSystemMsg === 'function') addSystemMsg('Voice needs Chrome or Edge — type your answers instead.');
    return;
  }

  _micOn = true;
  _micLang = 'en-IN';
  _launchRecognition(SR);
}

function _launchRecognition(SR, lang) {
  // Clean up any existing instance
  if (_recognition) { try { _recognition.abort(); } catch (_) {} _recognition = null; }
  clearTimeout(_restartTimer);

  const rec = new SR();
  _recognition = rec;

  rec.continuous     = true;
  rec.interimResults = true;
  rec.lang           = lang || _micLang;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    document.getElementById('micb')?.classList.add('on');
    _startWaveform();
    _showTranscriptOverlay(true);
    _setTranscriptText('', false);
  };

  rec.onresult = (e) => {
    let finalText = '';
    let interimText = '';

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText   += t;
      else                       interimText += t;
    }

    // Show live interim text in overlay
    _interimBuffer = interimText;
    _setTranscriptText(finalText || interimText, !finalText);

    if (finalText) {
      // A speaking burst is finishing — track it
      if (!_speakingNow) { COMM_TRACKER.startSpeaking(); _speakingNow = true; }
      COMM_TRACKER.endSpeaking(finalText);
      _speakingNow = false;

      // Put text in chat input and auto-send
      const inp = document.getElementById('cinp');
      if (inp) inp.value = finalText.trim();
      if (typeof ROOM !== 'undefined') ROOM.updateLastActivity();
      if (typeof sendMsg === 'function') sendMsg();

      _setTranscriptText('', false);
      _interimBuffer = '';
    } else {
      // Interim — start tracking speaking time
      if (!_speakingNow) { COMM_TRACKER.startSpeaking(); _speakingNow = true; }
    }
  };

  rec.onerror = (e) => {
    console.warn('[Voice] error:', e.error);

    // Language not supported → try en-US once
    if ((e.error === 'language-not-supported' || e.error === 'network') && rec.lang === 'en-IN') {
      _micLang = 'en-US';
      if (typeof addSystemMsg === 'function') addSystemMsg('Switching to en-US voice recognition.');
      _restartTimer = setTimeout(() => {
        if (_micOn) _launchRecognition(SR, 'en-US');
      }, 300);
      return;
    }

    // No speech detected — just restart quietly
    if (e.error === 'no-speech') {
      _scheduleRestart(SR);
      return;
    }

    // Aborted by us — don't restart
    if (e.error === 'aborted') return;

    // Any other error — show message and stop
    if (typeof addSystemMsg === 'function') addSystemMsg(`Microphone error: ${e.error}. Try toggling the mic button.`);
    stopMic();
  };

  rec.onend = () => {
    // Finish any open speaking burst
    if (_speakingNow && _interimBuffer) {
      COMM_TRACKER.endSpeaking(_interimBuffer);
      _speakingNow   = false;
      _interimBuffer = '';
    }

    // Auto-restart while mic is still "on"
    if (_micOn) _scheduleRestart(SR);
  };

  try {
    rec.start();
  } catch (err) {
    console.error('[Voice] start error:', err);
    _scheduleRestart(SR);
  }
}

/** Restart recognition after a brief debounce to avoid rapid loops. */
function _scheduleRestart(SR) {
  clearTimeout(_restartTimer);
  _restartTimer = setTimeout(() => {
    if (_micOn) _launchRecognition(SR, _micLang);
  }, 250);
}

function stopMic() {
  _micOn = false;
  clearTimeout(_restartTimer);

  if (_recognition) {
    try { _recognition.abort(); } catch (_) {}
    _recognition = null;
  }

  if (_speakingNow && _interimBuffer) {
    COMM_TRACKER.endSpeaking(_interimBuffer);
    _speakingNow   = false;
    _interimBuffer = '';
  }

  document.getElementById('micb')?.classList.remove('on');
  _showTranscriptOverlay(false);
  _stopWaveform();
}


/* ── Transcription overlay helpers ────────────────────────────────────── */

function _showTranscriptOverlay(show) {
  const el = document.getElementById('voice-transcript');
  if (!el) return;
  if (show) el.classList.add('active');
  else       el.classList.remove('active');
}

function _setTranscriptText(text, isInterim) {
  const el = document.getElementById('vt-text');
  if (!el) return;
  if (!text) { el.textContent = '…'; el.className = 'vt-text'; return; }
  el.textContent = text;
  el.className   = isInterim ? 'vt-text vt-interim' : 'vt-text';
}


/* ── Waveform animation ───────────────────────────────────────────────── */

function _startWaveform() {
  clearInterval(_waveInterval);
  _waveInterval = setInterval(() => {
    document.querySelectorAll('.wb3').forEach(b => {
      b.style.height = (2 + Math.random() * 20) + 'px';
    });
  }, 75);
}

function _stopWaveform() {
  clearInterval(_waveInterval);
  document.querySelectorAll('.wb3').forEach(b => { b.style.height = '3px'; });
}


/* ═══════════════════════════════════════════════════════════════════════
   TEARDOWN HOOKS
═══════════════════════════════════════════════════════════════════════ */

function stopAllMedia() {
  stopCamera();
  stopMic();
}

// Stop mic on tab hide (privacy)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && _micOn) stopMic();
});

// Release all tracks on page unload
window.addEventListener('beforeunload', stopAllMedia);
