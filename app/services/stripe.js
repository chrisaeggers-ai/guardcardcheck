/**
 * GuardCardCheck — Stripe Service Layer
 * All Stripe operations go through here. Never call Stripe directly from routes.
 *
 * Flow:
 *   Registration → createCustomer()
 *   Checkout     → createCheckoutSession()  → Stripe Hosted Checkout
 *   Webhook      → handleWebhook()          → updates DB subscription status
 *   Portal       → createPortalSession()    → Stripe Customer Portal (cancel, upgrade, update card)
 *   Event Pack   → createEventPackSession() → one-time payment
 */

const Stripe = require('stripe');
const { PLANS, ADDONS, getPlan, getPlanFromStripeId, isAnnual } = require('../config/plans');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  appInfo: {
    name: 'GuardCardCheck',
    version: '2.0.0',
    url: 'https://guardcardcheck.com',
  },
});

const BASE_URL = process.env.BASE_URL || 'https://guardcardcheck.com';

// ─────────────────────────────────────────────────────────────
// Customer Management
// ─────────────────────────────────────────────────────────────

/**
 * Create a Stripe customer for a new user.
 * Call this immediately after user registration.
 */
async function createCustomer({ email, name, organizationName, userId }) {
  const customer = await stripe.customers.create({
    email,
    name,
    description: organizationName,
    metadata: {
      userId,
      organizationName,
      platform: 'guardcardcheck',
      createdAt: new Date().toISOString(),
    },
  });
  return customer;
}

/**
 * Update customer metadata (e.g. after org name change)
 */
async function updateCustomer(stripeCustomerId, updates) {
  return stripe.customers.update(stripeCustomerId, updates);
}

/**
 * Retrieve customer with active subscriptions
 */
async function getCustomer(stripeCustomerId) {
  return stripe.customers.retrieve(stripeCustomerId, {
    expand: ['subscriptions'],
  });
}

// ─────────────────────────────────────────────────────────────
// Checkout Sessions
// ─────────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for a subscription plan.
 * Redirects user to Stripe hosted checkout page.
 *
 * @param {object} options
 * @param {string} options.planId       - 'starter' | 'business' | 'enterprise'
 * @param {string} options.billing      - 'monthly' | 'annual'
 * @param {string} options.stripeCustomerId
 * @param {string} options.userId
 * @param {string} options.userEmail
 * @param {number} options.trialDays    - optional free trial (default 0)
 */
async function createCheckoutSession({
  planId,
  billing = 'monthly',
  stripeCustomerId,
  userId,
  userEmail,
  trialDays = 0,
}) {
  const plan = getPlan(planId);
  if (!plan || planId === 'free') {
    throw new Error('Invalid plan for checkout');
  }

  const priceId = billing === 'annual'
    ? plan.stripeAnnualPriceId
    : plan.stripePriceId;

  if (!priceId) {
    throw new Error(`No Stripe price ID configured for ${planId} ${billing}. Check your .env file.`);
  }

  const sessionConfig = {
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/pricing?canceled=1`,
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: true },       // B2B tax IDs (EIN for US)
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,                // lets you create discount codes
    metadata: {
      userId,
      planId,
      billing,
    },
    subscription_data: {
      metadata: {
        userId,
        planId,
        billing,
        platform: 'guardcardcheck',
      },
    },
  };

  // Add trial if applicable
  if (trialDays > 0) {
    sessionConfig.subscription_data.trial_period_days = trialDays;
  }

  // Pre-fill email if not yet a customer
  if (!stripeCustomerId) {
    sessionConfig.customer_email = userEmail;
    delete sessionConfig.customer;
    delete sessionConfig.customer_update;
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return session;
}

/**
 * Create a checkout session for the Event Pack (one-time payment, $49).
 */
async function createEventPackSession({ stripeCustomerId, userEmail, userId, eventName }) {
  const addon = ADDONS.event_pack;

  if (!addon.stripePriceId) {
    throw new Error('Event Pack price ID not configured. Add STRIPE_PRICE_EVENT_PACK to .env');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomerId,
    customer_email: stripeCustomerId ? undefined : userEmail,
    line_items: [{ price: addon.stripePriceId, quantity: 1 }],
    success_url: `${BASE_URL}/event-pack/success?session_id={CHECKOUT_SESSION_ID}&event=${encodeURIComponent(eventName || '')}`,
    cancel_url: `${BASE_URL}/event-pack?canceled=1`,
    invoice_creation: { enabled: true },        // auto-generate invoice/receipt
    metadata: {
      userId,
      eventName,
      product: 'event_pack',
    },
  });

  return session;
}

// ─────────────────────────────────────────────────────────────
// Customer Portal
// ─────────────────────────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session.
 * Lets users: cancel, upgrade/downgrade, update payment method, view invoices.
 * Configure portal at: https://dashboard.stripe.com/test/settings/billing/portal
 */
async function createPortalSession({ stripeCustomerId, returnUrl }) {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl || `${BASE_URL}/dashboard/settings`,
  });
  return session;
}

// ─────────────────────────────────────────────────────────────
// Subscription Management
// ─────────────────────────────────────────────────────────────

/**
 * Get active subscription for a customer
 */
async function getSubscription(stripeCustomerId) {
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 1,
    expand: ['data.items.data.price.product'],
  });
  return subscriptions.data[0] || null;
}

/**
 * Immediately cancel a subscription (use for delinquent accounts)
 */
async function cancelSubscription(stripeSubscriptionId, { immediately = false } = {}) {
  if (immediately) {
    return stripe.subscriptions.cancel(stripeSubscriptionId);
  }
  // Cancel at period end (user keeps access until billing period ends)
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Upgrade or downgrade a subscription immediately
 */
async function changePlan(stripeSubscriptionId, newPriceId) {
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const subscriptionItemId = subscription.items.data[0].id;

  return stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: subscriptionItemId, price: newPriceId }],
    proration_behavior: 'always_invoice', // charge/credit difference immediately
  });
}

// ─────────────────────────────────────────────────────────────
// Invoices & Usage
// ─────────────────────────────────────────────────────────────

/**
 * Get recent invoices for a customer
 */
async function getInvoices(stripeCustomerId, limit = 12) {
  const invoices = await stripe.invoices.list({
    customer: stripeCustomerId,
    limit,
    expand: ['data.subscription'],
  });
  return invoices.data.map(inv => ({
    id: inv.id,
    number: inv.number,
    amount: inv.amount_paid / 100,
    currency: inv.currency.toUpperCase(),
    status: inv.status,
    date: new Date(inv.created * 1000).toISOString(),
    pdfUrl: inv.invoice_pdf,
    hostedUrl: inv.hosted_invoice_url,
    periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
    periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
  }));
}

/**
 * Get upcoming invoice (preview next charge)
 */
async function getUpcomingInvoice(stripeCustomerId) {
  try {
    const invoice = await stripe.invoices.retrieveUpcoming({ customer: stripeCustomerId });
    return {
      amount: invoice.amount_due / 100,
      currency: invoice.currency.toUpperCase(),
      dueDate: new Date(invoice.period_end * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Webhook Handler
// ─────────────────────────────────────────────────────────────

/**
 * Verify and parse a Stripe webhook event.
 * Must be called with the raw request body (before JSON.parse).
 */
function constructWebhookEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Main webhook event dispatcher.
 * Called from the webhook route — handles all subscription lifecycle events.
 *
 * @param {Stripe.Event} event
 * @param {object} db - database client (pg Pool)
 */
async function handleWebhookEvent(event, db) {
  const { type, data } = event;

  console.log(`[Stripe Webhook] ${type}`);

  switch (type) {

    // ── Checkout completed → provision plan ──
    case 'checkout.session.completed': {
      const session = data.object;
      if (session.mode === 'subscription') {
        await provisionSubscription(session, db);
      } else if (session.metadata?.product === 'event_pack') {
        await provisionEventPack(session, db);
      }
      break;
    }

    // ── Subscription activated (also fires after trial) ──
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = data.object;
      await syncSubscriptionToDb(sub, db);
      break;
    }

    // ── Subscription cancelled or expired ──
    case 'customer.subscription.deleted': {
      const sub = data.object;
      await db.query(
        `UPDATE users SET plan = 'free', stripe_subscription_id = NULL, 
         subscription_status = 'canceled', plan_expires_at = NOW()
         WHERE stripe_customer_id = $1`,
        [sub.customer]
      );
      console.log(`[Stripe] Subscription canceled for customer ${sub.customer}`);
      break;
    }

    // ── Payment succeeded → extend access ──
    case 'invoice.payment_succeeded': {
      const invoice = data.object;
      if (invoice.subscription) {
        await db.query(
          `UPDATE users SET subscription_status = 'active'
           WHERE stripe_customer_id = $1`,
          [invoice.customer]
        );
      }
      break;
    }

    // ── Payment failed → notify user ──
    case 'invoice.payment_failed': {
      const invoice = data.object;
      await db.query(
        `UPDATE users SET subscription_status = 'past_due'
         WHERE stripe_customer_id = $1`,
        [invoice.customer]
      );
      // TODO: send "payment failed" email via SendGrid/Postmark
      console.log(`[Stripe] Payment failed for customer ${invoice.customer}`);
      break;
    }

    // ── Trial ending in 3 days → send reminder ──
    case 'customer.subscription.trial_will_end': {
      const sub = data.object;
      // TODO: send trial-ending email
      console.log(`[Stripe] Trial ending for subscription ${sub.id}`);
      break;
    }

    // ── Dispute opened ──
    case 'charge.dispute.created': {
      const dispute = data.object;
      console.warn(`[Stripe] ⚠️ Dispute created: ${dispute.id} — amount: $${dispute.amount/100}`);
      // TODO: alert to Slack/email
      break;
    }

    default:
      // Unhandled event — log but don't error
      console.log(`[Stripe Webhook] Unhandled event type: ${type}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────

async function provisionSubscription(checkoutSession, db) {
  const { metadata, customer, subscription: subscriptionId } = checkoutSession;
  const { userId, planId, billing } = metadata;

  if (userId === 'guest') {
    console.log('[Stripe] Guest checkout completed — skipping DB provision (no user to update).');
    return;
  }

  // Fetch the full subscription object
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0].price.id;
  const plan = getPlanFromStripeId(priceId);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

  await db.query(`
    UPDATE users 
    SET 
      plan = $1,
      stripe_customer_id = $2,
      stripe_subscription_id = $3,
      stripe_price_id = $4,
      subscription_status = $5,
      billing_interval = $6,
      plan_expires_at = $7,
      updated_at = NOW()
    WHERE id = $8
  `, [
    plan.id,
    customer,
    subscriptionId,
    priceId,
    subscription.status,
    billing || 'monthly',
    currentPeriodEnd.toISOString(),
    userId,
  ]);

  // Reset monthly usage counter on new subscription
  await db.query(
    `UPDATE usage_stats SET monthly_searches = 0, reset_at = NOW() WHERE user_id = $1`,
    [userId]
  );

  console.log(`[Stripe] Provisioned ${plan.id} plan for user ${userId}`);
}

async function syncSubscriptionToDb(subscription, db) {
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromStripeId(priceId);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const billing = isAnnual(priceId) ? 'annual' : 'monthly';

  await db.query(`
    UPDATE users
    SET
      plan = $1,
      stripe_subscription_id = $2,
      stripe_price_id = $3,
      subscription_status = $4,
      billing_interval = $5,
      plan_expires_at = $6,
      updated_at = NOW()
    WHERE stripe_customer_id = $7
  `, [
    subscription.status === 'canceled' ? 'free' : plan.id,
    subscription.id,
    priceId,
    subscription.status,
    billing,
    currentPeriodEnd.toISOString(),
    subscription.customer,
  ]);
}

async function provisionEventPack(checkoutSession, db) {
  const { metadata, customer } = checkoutSession;
  const { userId, eventName } = metadata;

  if (userId === 'guest') {
    console.log('[Stripe] Guest event pack completed — skipping DB provision.');
    return null;
  }

  const crypto = require('crypto');
  const token = 'ep_' + crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.query(`
    INSERT INTO event_packs (user_id, stripe_session_id, event_name, token, expires_at, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [userId, checkoutSession.id, eventName, token, expiresAt.toISOString()]);

  console.log(`[Stripe] Event pack provisioned for user ${userId}: ${eventName}`);
  return token;
}

// ─────────────────────────────────────────────────────────────
// Utility Exports
// ─────────────────────────────────────────────────────────────

/**
 * Format a Stripe subscription for the API response (remove internal fields)
 */
function formatSubscriptionForClient(subscription, plan) {
  if (!subscription) return null;
  return {
    id: subscription.id,
    plan: plan.id,
    planName: plan.name,
    status: subscription.status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    billingInterval: subscription.items.data[0]?.price.recurring?.interval || 'month',
    monthlyPrice: plan.monthlyPrice,
    annualPrice: plan.annualPrice,
  };
}

module.exports = {
  stripe,
  createCustomer,
  updateCustomer,
  getCustomer,
  createCheckoutSession,
  createEventPackSession,
  createPortalSession,
  getSubscription,
  cancelSubscription,
  changePlan,
  getInvoices,
  getUpcomingInvoice,
  constructWebhookEvent,
  handleWebhookEvent,
  formatSubscriptionForClient,
};
