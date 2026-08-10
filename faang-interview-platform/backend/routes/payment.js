/**
 * routes/payment.js — Razorpay subscription payment
 *
 * POST /api/payment/create-order   — create Razorpay order (₹2000)
 * POST /api/payment/verify         — verify payment signature → activate subscription
 * GET  /api/payment/status         — current subscription status
 */

const router    = require('express').Router();
const Razorpay  = require('razorpay');
const crypto    = require('crypto');
const User      = require('../models/User');
const { requireAuth } = require('../middleware/auth');

/* ── Razorpay client (initialised lazily so server starts without keys in dev) */
let _rzp = null;
function getRazorpay() {
  if (!_rzp) {
    _rzp = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _rzp;
}

/* ── POST /api/payment/create-order ───────────────────────────────── */
router.post('/create-order', requireAuth, async (req, res) => {
  try {
    const amount = parseInt(process.env.SUBSCRIPTION_PRICE_PAISE) || 200000; // ₹2000

    const order = await getRazorpay().orders.create({
      amount,
      currency: 'INR',
      receipt:  `sub_${req.user._id}_${Date.now()}`,
      notes: {
        userId: String(req.user._id),
        email:  req.user.email,
        plan:   'monthly',
      },
    });

    res.json({
      orderId:   order.id,
      amount:    order.amount,      // in paise
      currency:  order.currency,
      keyId:     process.env.RAZORPAY_KEY_ID,
      userName:  req.user.name,
      userEmail: req.user.email,
    });
  } catch (err) {
    console.error('[payment/create-order]', err);
    res.status(500).json({ error: 'Could not create payment order. Please try again.' });
  }
});

/* ── POST /api/payment/verify ─────────────────────────────────────── */
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment fields.' });
    }

    // Verify HMAC signature — this is the security critical step
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      console.warn('[payment/verify] Signature mismatch for user', req.user._id);
      return res.status(400).json({ error: 'Payment verification failed. Contact support.' });
    }

    // Activate subscription for 30 days from now
    const now     = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    await User.findByIdAndUpdate(req.user._id, {
      'subscription.status':            'active',
      'subscription.startDate':         now,
      'subscription.endDate':           endDate,
      'subscription.razorpayOrderId':   razorpay_order_id,
      'subscription.razorpayPaymentId': razorpay_payment_id,
    });

    res.json({
      success:  true,
      message:  'Subscription activated! Valid for 30 days.',
      endDate,
    });
  } catch (err) {
    console.error('[payment/verify]', err);
    res.status(500).json({ error: 'Verification failed. Please contact support.' });
  }
});

/* ── GET /api/payment/status ──────────────────────────────────────── */
router.get('/status', requireAuth, async (req, res) => {
  const u = req.user;
  res.json({
    isSubscribed: u.isSubscribed(),
    status:       u.subscription.status,
    endDate:      u.subscription.endDate,
    daysLeft:     u.isSubscribed()
      ? Math.ceil((new Date(u.subscription.endDate) - new Date()) / 86400000)
      : 0,
  });
});

module.exports = router;
