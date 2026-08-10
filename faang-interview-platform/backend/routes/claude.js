/**
 * routes/claude.js — Secure Claude API proxy
 *
 * POST /api/claude/chat
 *
 * This route is the KEY security piece:
 *  - The Anthropic API key NEVER leaves the server
 *  - Only authenticated + subscribed users can call this
 *  - Per-user rate limiting prevents abuse
 *  - Request body is validated before forwarding
 */

const router  = require('express').Router();
const fetch   = require('node-fetch');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireSubscription } = require('../middleware/auth');
const User    = require('../models/User');

/* ── Per-user rate limit: 60 calls / minute ────────────────────────── */
const claudeRateLimit = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max:      60,
  keyGenerator: (req) => req.user._id.toString(),
  message: { error: 'Too many requests. Please slow down.' },
});

/* ── POST /api/claude/chat ─────────────────────────────────────────── */
router.post(
  '/chat',
  requireAuth,
  requireSubscription,
  claudeRateLimit,
  async (req, res) => {
    try {
      const { messages, system, maxTokens } = req.body;

      // Validate input
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required.' });
      }
      if (messages.length > 30) {
        return res.status(400).json({ error: 'Too many messages (max 30).' });
      }

      // Sanitise each message: only allow role + string content
      const safeMessages = messages.map(m => ({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').substring(0, 4000),  // cap per message
      }));

      const body = {
        model:      process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: Math.min(parseInt(maxTokens) || 900, 1500),  // hard cap
        messages:   safeMessages,
      };
      if (system) body.system = String(system).substring(0, 2000);

      // Forward to Anthropic — API key stays server-side
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'x-api-key':       process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const data = await upstream.json();

      if (data.error) {
        console.error('[claude/chat] upstream error:', data.error);
        return res.status(502).json({ error: `AI error: ${data.error.message}` });
      }

      // Increment usage counter (async, don't await — non-blocking)
      User.findByIdAndUpdate(req.user._id, {
        $inc: { 'interviews.total': 0 },   // just tracking calls for now
      }).catch(() => {});

      res.json({ content: data.content });

    } catch (err) {
      console.error('[claude/chat]', err);
      res.status(500).json({ error: 'AI service temporarily unavailable.' });
    }
  }
);

module.exports = router;
