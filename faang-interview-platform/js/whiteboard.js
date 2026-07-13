/**
 * whiteboard.js — Canvas whiteboard for HLD / LLD rounds
 *
 * Tools: pen, rectangle, circle, arrow, text, eraser
 * Colours: black, purple, red, green, amber
 * Also supports touch events for tablet use
 */

let _wbTool = 'pen';
let _wbCol  = '#222222';
let _wbDraw = false;
let _wbCtx  = null;     // CanvasRenderingContext2D
let _wbSX   = 0;        // stroke start X
let _wbSY   = 0;        // stroke start Y
let _wbSnap = null;     // ImageData snapshot before shape preview

/** Initialise (or reinitialise) whiteboard canvas. Call after showing the WB pane. */
function initWhiteboard() {
  const canvas = document.getElementById('wbc');
  if (!canvas) return;

  const parent = canvas.parentElement;
  canvas.width  = parent.clientWidth;
  canvas.height = parent.clientHeight;

  _wbCtx = canvas.getContext('2d');
  _wbCtx.lineCap  = 'round';
  _wbCtx.lineJoin = 'round';

  // Mouse events
  canvas.onmousedown  = _wbStart;
  canvas.onmousemove  = _wbMove;
  canvas.onmouseup    = _wbEnd;
  canvas.onmouseleave = _wbEnd;

  // Touch events (tablet support)
  canvas.ontouchstart = e => { e.preventDefault(); _wbStart(e.touches[0]); };
  canvas.ontouchmove  = e => { e.preventDefault(); _wbMove(e.touches[0]);  };
  canvas.ontouchend   = _wbEnd;
}

/** Get canvas-relative coordinates from a mouse/touch event. */
function _wbPos(e) {
  const r = document.getElementById('wbc').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function _wbStart(e) {
  if (_wbTool === 'text') { _wbAddText(e); return; }

  _wbDraw = true;
  const p = _wbPos(e);
  _wbSX = p.x; _wbSY = p.y;

  if (_wbTool === 'pen' || _wbTool === 'erase') {
    _wbCtx.beginPath();
    _wbCtx.moveTo(p.x, p.y);
  } else {
    // Snapshot canvas so we can preview shapes without trails
    const c = document.getElementById('wbc');
    _wbSnap = _wbCtx.getImageData(0, 0, c.width, c.height);
  }
}

function _wbMove(e) {
  if (!_wbDraw) return;
  const p   = _wbPos(e);
  const sz  = parseInt(document.getElementById('wsz').value, 10) || 2;

  _wbCtx.lineWidth = sz;

  if (_wbTool === 'pen') {
    _wbCtx.strokeStyle = _wbCol;
    _wbCtx.lineTo(p.x, p.y);
    _wbCtx.stroke();
  } else if (_wbTool === 'erase') {
    _wbCtx.strokeStyle = '#f8f8f0';  // match whiteboard background
    _wbCtx.lineWidth   = sz * 4;
    _wbCtx.lineTo(p.x, p.y);
    _wbCtx.stroke();
  } else {
    // Restore snapshot then draw current shape preview
    const c = document.getElementById('wbc');
    _wbCtx.putImageData(_wbSnap, 0, 0);
    _wbCtx.strokeStyle = _wbCol;
    _wbCtx.beginPath();

    if (_wbTool === 'rect') {
      _wbCtx.strokeRect(_wbSX, _wbSY, p.x - _wbSX, p.y - _wbSY);
    } else if (_wbTool === 'circle') {
      const rx = Math.abs(p.x - _wbSX) / 2;
      const ry = Math.abs(p.y - _wbSY) / 2;
      _wbCtx.ellipse(
        _wbSX + (p.x - _wbSX) / 2,
        _wbSY + (p.y - _wbSY) / 2,
        rx || 1, ry || 1, 0, 0, Math.PI * 2
      );
      _wbCtx.stroke();
    } else if (_wbTool === 'arrow') {
      const headLen = 14;
      const angle   = Math.atan2(p.y - _wbSY, p.x - _wbSX);
      _wbCtx.moveTo(_wbSX, _wbSY);
      _wbCtx.lineTo(p.x, p.y);
      _wbCtx.lineTo(p.x - headLen * Math.cos(angle - Math.PI / 7),
                    p.y - headLen * Math.sin(angle - Math.PI / 7));
      _wbCtx.moveTo(p.x, p.y);
      _wbCtx.lineTo(p.x - headLen * Math.cos(angle + Math.PI / 7),
                    p.y - headLen * Math.sin(angle + Math.PI / 7));
      _wbCtx.stroke();
    }
  }
}

function _wbEnd() { _wbDraw = false; _wbSnap = null; }

/** Prompt for text and render it at the clicked position. */
function _wbAddText(e) {
  const p    = _wbPos(e);
  const text = prompt('Enter text for whiteboard:');
  if (!text) return;
  const sz   = parseInt(document.getElementById('wsz').value, 10) || 2;
  _wbCtx.font      = `${Math.max(14, sz * 5)}px Inter, sans-serif`;
  _wbCtx.fillStyle = _wbCol;
  // Sanitise: only print visible characters
  _wbCtx.fillText(text.replace(/[<>"'&]/g, ''), p.x, p.y);
}

/* ── Public helpers ──────────────────────────────────────────────────── */

function setWbTool(tool, btn) {
  _wbTool = tool;
  document.querySelectorAll('.wbt').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function setWbColor(color, el) {
  _wbCol = color;
  document.querySelectorAll('.wbc2').forEach(b => b.classList.remove('sel'));
  if (el) el.classList.add('sel');
}

function clearWhiteboard() {
  if (!_wbCtx) return;
  const c = document.getElementById('wbc');
  _wbCtx.clearRect(0, 0, c.width, c.height);
}
