/**
 * server.js — Main Express server for FAANG Interview SaaS
 *
 * Start: node server.js  (or  npm run dev  for auto-reload)
 */

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const mongoose   = require('mongoose');
const path       = require('path');

const app = express();

/* ── Security middleware ────────────────────────────────────────────── */
app.use(helmet({
  // Allow our own frontend to load scripts/styles
  contentSecurityPolicy: false,
}));

// CORS — only allow your frontend domain in production
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:8080',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50kb' }));  // prevent giant payloads

/* ── Global rate limit: 200 req/min per IP ──────────────────────────── */
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  message: { error: 'Too many requests from this IP. Please slow down.' },
}));

/* ── MongoDB connection ─────────────────────────────────────────────── */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB connection failed:', err); process.exit(1); });

/* ── API routes ─────────────────────────────────────────────────────── */
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/claude',  require('./routes/claude'));

/* ── Health check ───────────────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ── Serve frontend build (for production single-server deploy) ──────── */
// In production, copy your frontend dist/ folder to backend/public/
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// For any non-API route, serve index.html (SPA routing)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend not found. Run the frontend separately in dev.');
  });
});

/* ── Error handler ──────────────────────────────────────────────────── */
app.use((err, req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

/* ── Start ──────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});
