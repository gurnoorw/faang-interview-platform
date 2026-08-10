/**
 * routes/auth.js — Authentication endpoints
 *
 * POST /api/auth/signup  — create account
 * POST /api/auth/login   — get JWT
 * GET  /api/auth/me      — current user info + subscription status
 */

const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const { requireAuth } = require('../middleware/auth');

/* ── Helper: sign a JWT ────────────────────────────────────────────── */
function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/* ── POST /api/auth/signup ─────────────────────────────────────────── */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Check duplicate email
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // passwordHash receives the plain text — pre-save hook hashes it
    const user  = await User.create({ name, email, passwordHash: password });
    const token = signToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, subscription: user.subscription },
    });
  } catch (err) {
    console.error('[auth/signup]', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

/* ── POST /api/auth/login ──────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.verifyPassword(password))) {
      // Deliberately vague — don't reveal whether email exists
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = signToken(user._id);
    res.json({
      token,
      user: {
        id:           user._id,
        name:         user.name,
        email:        user.email,
        subscription: user.subscription,
        isSubscribed: user.isSubscribed(),
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* ── GET /api/auth/me ──────────────────────────────────────────────── */
router.get('/me', requireAuth, async (req, res) => {
  const u = req.user;
  res.json({
    id:           u._id,
    name:         u.name,
    email:        u.email,
    subscription: u.subscription,
    isSubscribed: u.isSubscribed(),
    interviews:   u.interviews,
  });
});

module.exports = router;
