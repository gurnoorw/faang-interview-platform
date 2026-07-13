/**
 * media.js — Camera and Microphone management
 *
 * Security guarantees:
 *  • Camera video is LOCAL ONLY — srcObject never transmitted anywhere
 *  • Microphone: browser Web Speech API → only the final transcript text is
 *    ever sent to Claude; raw audio stays in the browser
 *  • All tracks are stopped on endInterview(), goHome(), beforeunload,
 *    and visibilitychange (tab hidden)
 */

let _camStream    = null;   // MediaStream | null
let _recognition  = null;   // SpeechRecognition | null
let _micOn        = false;
let _waveInterval = null;   // setInterval handle for waveform animation

/* ─────────────────────────── Camera ────────────────────────────────────── */

/**
 * Toggle camera on/off.
 * On success, mirrors video into #vid element.
 * On failure, shows human-readable error in chat.
 */
async function toggleCam() {
  if (_camStream) {
    stopCamera();
  } else {
    try {
      _camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 280 }, height: { ideal: 200 }, facingMode: 'user' },
        audio: false,                       // mic is separate
      });
      const vid = document.getElementById('vid');
      vid.srcObject      = _camStream;
      vid.style.display  = 'block';
      document.getElementById('cam-ph').style.display  = 'none';
      document.getElementById('rec-b').classList.add('on');
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied — allow it in browser settings.'
        : 'Camera unavailable on this device.';
      addSystemMsg(msg);
    }
  }
}

/** Stop camera tracks and reset UI. Safe to call even if camera is already off. */
function stopCamera() {
  if (_camStream) {
    _camStream.getTracks().forEach(t => t.stop());
    _camStream = null;
  }
  const vid = document.getElementById('vid');
  if (vid) { vid.srcObject = null; vid.style.display = 'none'; }
  const ph = document.getElementById('cam-ph');
  if (ph) ph.style.display = 'flex';
  const rec = document.getElementById('rec-b');
  if (rec) rec.classList.remove('on');
}

/* ─────────────────────────── Microphone ────────────────────────────────── */

function toggleMic() { _micOn ? stopMic() : startMic(); }

/**
 * Start the Web Speech API recogniser.
 * Continuous mode: fills the input box with interim results; on final result, calls sendMsg().
 */
function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addSystemMsg('Speech recognition needs Chrome or Edge.'); return; }

  _recognition                = new SR();
  _recognition.continuous     = true;
  _recognition.interimResults = true;
  _recognition.lang           = 'en-IN';   // Indian English

  _recognition.onstart = () => {
    _micOn = true;
    document.getElementById('micb').classList.add('on');
    _startWaveform();
  };

  _recognition.onresult = (e) => {
    let final = '', interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final   += e.results[i][0].transcript;
      else                       interim += e.results[i][0].transcript;
    }
    document.getElementById('cinp').value = final || interim;
    if (final) {
      // Auto-submit final transcript as user message
      ROOM.updateLastActivity();
      sendMsg();
    }
  };

  _recognition.onend   = () => stopMic();
  _recognition.onerror = () => stopMic();
  _recognition.start();
}

/** Stop mic and clean up. Safe to call if mic is already off. */
function stopMic() {
  _micOn = false;
  if (_recognition) { try { _recognition.stop(); } catch (_) {} _recognition = null; }
  const btn = document.getElementById('micb');
  if (btn) btn.classList.remove('on');
  _stopWaveform();
}

/* ─────────────────────── Waveform animation ─────────────────────────────── */

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

/* ─────────────────────── Teardown hooks ────────────────────────────────── */

/** Call this on every exit path — end interview, go home, page close. */
function stopAllMedia() {
  stopCamera();
  stopMic();
}

// Stop mic if user hides the tab (privacy)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && _micOn) stopMic();
});

// Release all tracks on page unload
window.addEventListener('beforeunload', () => stopAllMedia());
