/**
 * middleware/auth.js — JWT authentication + subscription guard
 *
 * requireAuth:         verifies JWT token → attaches req.user
 * requireSubscription: additionally checks active subscription
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Extract and verify JWT from Authorization: Bearer <token> header.
 * Attaches the full User document to req.user on success.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    // Throws if expired or invalid signature
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user (catches deleted / banned accounts)
    const user = await User.findById(payload.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

/**
 * Requires an active subscription.
 * Must be used AFTER requireAuth (depends on req.user).
 */
async function requireSubscription(req, res, next) {
  if (!req.user.isSubscribed()) {
    return res.status(403).json({
      error: 'Active subscription required.',
      code:  'SUBSCRIPTION_REQUIRED',   // frontend uses this to redirect to payment
    });
  }
  next();
}

module.exports = { requireAuth, requireSubscription };
