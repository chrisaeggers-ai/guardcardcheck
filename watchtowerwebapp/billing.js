/**
 * GuardCardCheck — Billing Routes
 *
 * GET  /api/billing/plans               — Return all plan configs + current user plan
 * POST /api/billing/checkout/:planId    — Create Stripe Checkout session
 * POST /api/billing/event-pack          — Create Event Pack one-time checkout
 * GET  /api/billing/portal              — Create Stripe Customer Portal session
 * GET  /api/billing/subscription        — Get current subscription details
 * GET  /api/billing/invoices            — Get invoice history
 * GET  /api/billing/usage               — Get current usage stats
 * POST /api/billing/webhook             — Stripe webhook receiver (NO auth — raw body)
 */

const express = require('express');
const router = express.Router();
const stripeService = require('../services/stripe');
const { PLANS, ADDONS, getPlan } = require('../config/plans');
const { authMiddleware } = require('../middleware/auth');

// Webhook needs raw body — must be registered BEFORE express.json()
// This is handled in server.js by mounting this router before body parsing middleware

// ─────────────────────────────────────────────────────────────
// Plans
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/billing/plans
 * Returns all plan configs. If authenticated, includes current plan status.
 */
router.get('/plans', (req, res) => {
  // Try to extract user from optional token
  let currentPlan = 'free';
  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.slice(7);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      currentPlan = decoded.plan || 'free';
    }
  } catch {}

  const plans = Object.values(PLANS).map(p => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    monthlyPrice: p.monthlyPrice,
    annualPrice: p.annualPrice,
    annualSavings: p.annualSavings || null,
    limits: p.limits,
    popular: p.popular,
    isCurrent: p.id === currentPlan,
    cta: p.id === currentPlan ? 'Current Plan' : p.cta,
  }));

  res.json({
    plans,
    addons: Object.values(ADDONS).map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      price: a.price,
      notes: a.notes,
    })),
    currentPlan,
  });
});

// ─────────────────────────────────────────────────────────────
// Checkout
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/billing/checkout/:planId
 * Create a Stripe Checkout session and return the checkout URL.
 *
 * Body: { billing: 'monthly' | 'annual' }
 *
 * Flow:
 *   1. Auth required (user must be registered first)
 *   2. Creates Stripe session
 *   3. Returns { checkoutUrl } — frontend redirects user there
 *   4. Stripe calls webhook after payment
 *   5. Webhook provisions the plan
 */
router.post('/checkout/:planId', authMiddleware, async (req, res) => {
  const { planId } = req.params;
  const { billing = 'monthly' } = req.body;
  const { id: userId, email, stripeCustomerId, plan: currentPlan } = req.user;

  if (planId === 'free') {
    return res.status(400).json({ error: 'Cannot checkout the free plan.' });
  }

  if (!PLANS[planId]) {
    return res.status(404).json({ error: `Unknown plan: ${planId}` });
  }

  if (currentPlan === planId && billing === req.user.billingInterval) {
    return res.status(400).json({ error: 'You are already on this plan.' });
  }

  try {
    const session = await stripeService.createCheckoutSession({
      planId,
      billing,
      stripeCustomerId: req.user.stripeCustomerId,
      userId,
      userEmail: email,
    });

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('[Billing] Checkout error:', error.message);
    res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
});

/**
 * POST /api/billing/event-pack
 * Create a checkout for the $49 Event Pack add-on.
 *
 * Body: { eventName: 'Super Bowl Security Feb 2026' }
 */
router.post('/event-pack', authMiddleware, async (req, res) => {
  const { eventName } = req.body;
  const { id: userId, email } = req.user;

  try {
    const session = await stripeService.createEventPackSession({
      stripeCustomerId: req.user.stripeCustomerId,
      userEmail: email,
      userId,
      eventName,
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Billing] Event Pack checkout error:', error.message);
    res.status(500).json({ error: 'Failed to create event pack checkout.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Customer Portal
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/billing/portal
 * Returns a Stripe Customer Portal URL.
 * User can update card, download invoices, cancel, upgrade/downgrade.
 */
router.get('/portal', authMiddleware, async (req, res) => {
  const { stripeCustomerId } = req.user;

  if (!stripeCustomerId) {
    return res.status(400).json({
      error: 'No billing account found. Please subscribe to a plan first.',
      redirectTo: '/pricing',
    });
  }

  try {
    const session = await stripeService.createPortalSession({
      stripeCustomerId,
      returnUrl: `${process.env.BASE_URL}/dashboard/settings/billing`,
    });
    res.json({ portalUrl: session.url });
  } catch (error) {
    console.error('[Billing] Portal error:', error.message);
    res.status(500).json({ error: 'Failed to open billing portal.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Subscription Status
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/billing/subscription
 * Returns current plan, limits, usage, and upcoming invoice.
 */
router.get('/subscription', authMiddleware, async (req, res) => {
  const { id: userId, plan, stripeCustomerId } = req.user;

  const planConfig = getPlan(plan);

  // Get usage from DB
  let usage = { monthly_searches: 0, daily_searches: 0, total_searches: 0 };
  try {
    const db = req.app.get('db');
    const { rows } = await db.query(
      `SELECT monthly_searches, daily_searches, total_searches
       FROM usage_stats
       WHERE user_id = $1 AND month_year = TO_CHAR(NOW(), 'YYYY-MM')`,
      [userId]
    );
    if (rows.length) usage = rows[0];
  } catch {}

  // Get Stripe subscription details
  let stripeSubscription = null;
  let upcomingInvoice = null;
  if (stripeCustomerId) {
    try {
      stripeSubscription = await stripeService.getSubscription(stripeCustomerId);
      upcomingInvoice = await stripeService.getUpcomingInvoice(stripeCustomerId);
    } catch {}
  }

  res.json({
    plan: plan,
    planName: planConfig.name,
    monthlyPrice: planConfig.monthlyPrice,
    limits: planConfig.limits,
    usage: {
      monthlySearches: usage.monthly_searches,
      dailySearches: usage.daily_searches,
      totalSearches: usage.total_searches,
      monthlyLimit: planConfig.limits.searchesPerMonth,
      dailyLimit: plan === 'free' ? 1 : null,
      percentUsed: planConfig.limits.searchesPerMonth
        ? Math.round((usage.monthly_searches / planConfig.limits.searchesPerMonth) * 100)
        : null,
    },
    subscription: stripeService.formatSubscriptionForClient(stripeSubscription, planConfig),
    upcomingInvoice,
  });
});

/**
 * GET /api/billing/invoices
 * Returns invoice history.
 */
router.get('/invoices', authMiddleware, async (req, res) => {
  const { stripeCustomerId } = req.user;
  if (!stripeCustomerId) return res.json({ invoices: [] });

  try {
    const invoices = await stripeService.getInvoices(stripeCustomerId);
    res.json({ invoices });
  } catch (error) {
    console.error('[Billing] Invoice fetch error:', error.message);
    res.status(500).json({ error: 'Failed to load invoices.' });
  }
});

/**
 * GET /api/billing/usage
 * Lightweight usage stats for the dashboard header/widgets.
 */
router.get('/usage', authMiddleware, async (req, res) => {
  const { id: userId, plan } = req.user;
  const planConfig = getPlan(plan);
  const db = req.app.get('db');

  try {
    const { rows } = await db.query(
      `SELECT monthly_searches, daily_searches, total_searches, last_search_at
       FROM usage_stats
       WHERE user_id = $1 AND month_year = TO_CHAR(NOW(), 'YYYY-MM')`,
      [userId]
    );

    const usage = rows[0] || { monthly_searches: 0, daily_searches: 0, total_searches: 0 };

    res.json({
      plan,
      monthly: {
        used: usage.monthly_searches,
        limit: planConfig.limits.searchesPerMonth,
        unlimited: !planConfig.limits.searchesPerMonth,
        percentUsed: planConfig.limits.searchesPerMonth
          ? Math.round((usage.monthly_searches / planConfig.limits.searchesPerMonth) * 100)
          : 0,
      },
      daily: {
        used: usage.daily_searches,
        limit: plan === 'free' ? 1 : null,
      },
      total: usage.total_searches,
      lastSearchAt: usage.last_search_at,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load usage stats.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Stripe Webhook (NO auth — raw body required)
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/billing/webhook
 *
 * IMPORTANT: This route must receive the RAW request body (Buffer),
 * not JSON-parsed. See server.js for the express.raw() setup.
 *
 * Stripe sends these events — we handle them all:
 *   checkout.session.completed        → provision plan / event pack
 *   customer.subscription.updated     → sync plan changes
 *   customer.subscription.deleted     → downgrade to free
 *   invoice.payment_succeeded         → mark active
 *   invoice.payment_failed            → mark past_due, send email
 *   customer.subscription.trial_will_end → send reminder
 */
router.post('/webhook',
  express.raw({ type: 'application/json' }),   // MUST be raw Buffer
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      console.warn('[Webhook] Missing stripe-signature header');
      return res.status(400).send('Missing signature');
    }

    let event;
    try {
      event = stripeService.constructWebhookEvent(req.body, sig);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook error: ${err.message}`);
    }

    // Idempotency: skip already-processed events
    const db = req.app.get('db');
    try {
      await db.query(
        `INSERT INTO stripe_events (stripe_event_id, event_type) VALUES ($1, $2)`,
        [event.id, event.type]
      );
    } catch (err) {
      if (err.code === '23505') {
        // Duplicate — already processed
        console.log(`[Webhook] Duplicate event ${event.id} — skipping`);
        return res.json({ received: true, duplicate: true });
      }
      // Log but continue processing
      console.error('[Webhook] Could not record event ID:', err.message);
    }

    // Process the event
    try {
      await stripeService.handleWebhookEvent(event, db);
      res.json({ received: true });
    } catch (error) {
      console.error('[Webhook] Handler error:', error.message);
      // Return 200 anyway — otherwise Stripe retries and can cause loops
      res.json({ received: true, error: error.message });
    }
  }
);

module.exports = router;
