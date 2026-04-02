/**
 * GuardCardCheck — Plan Definitions
 * Single source of truth for all pricing, limits, and features.
 * These IDs must match your Stripe dashboard exactly.
 *
 * Stripe setup checklist:
 *   1. Create Products in Stripe Dashboard (or via CLI)
 *   2. Create monthly + annual Prices for each Product
 *   3. Copy Price IDs into STRIPE_PRICE_IDs below
 *   4. Set env vars in .env
 */

const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Try it out',
    monthlyPrice: 0,
    annualPrice: 0,
    stripePriceId: null,
    stripeAnnualPriceId: null,
    limits: {
      searchesPerDay: 1,
      searchesPerMonth: null,   // calculated from daily
      maxRosterSize: 0,         // no roster
      maxUsers: 1,
      states: 10,               // all states visible, but limited searches
      nameSearch: false,
      batchVerify: false,
      apiAccess: false,
      alertsEnabled: false,
      exportEnabled: false,
      dedicatedSupport: false,
    },
    color: '#6B7280',
    cta: 'Start Free',
    ctaHref: '/register',
    popular: false,
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For small PPOs',
    monthlyPrice: 29,
    annualPrice: 290,           // 2 months free ($348 → $290)
    annualSavings: 58,
    stripePriceId: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    limits: {
      searchesPerDay: null,     // unlimited daily
      searchesPerMonth: 25,
      maxRosterSize: 25,
      maxUsers: 2,
      states: 10,
      nameSearch: true,
      batchVerify: false,
      apiAccess: false,
      alertsEnabled: true,      // email alerts on expiry
      exportEnabled: false,
      dedicatedSupport: false,
    },
    color: '#1A56DB',
    cta: 'Start Starter',
    ctaHref: '/checkout/starter',
    popular: false,
  },

  business: {
    id: 'business',
    name: 'Business',
    tagline: 'For growing PPOs',
    monthlyPrice: 79,
    annualPrice: 790,           // 2 months free ($948 → $790)
    annualSavings: 158,
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
    limits: {
      searchesPerDay: null,
      searchesPerMonth: 200,
      maxRosterSize: 200,
      maxUsers: 10,
      states: 10,
      nameSearch: true,
      batchVerify: true,
      apiAccess: false,
      alertsEnabled: true,
      exportEnabled: true,      // CSV/Excel export of results
      dedicatedSupport: false,
    },
    color: '#1A56DB',
    cta: 'Start Business',
    ctaHref: '/checkout/business',
    popular: true,
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large operators',
    monthlyPrice: 199,
    annualPrice: 1990,          // 2 months free ($2388 → $1990)
    annualSavings: 398,
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
    limits: {
      searchesPerDay: null,
      searchesPerMonth: null,   // unlimited
      maxRosterSize: 5000,
      maxUsers: null,           // unlimited
      states: 10,
      nameSearch: true,
      batchVerify: true,
      apiAccess: true,          // REST API access + API keys
      alertsEnabled: true,
      exportEnabled: true,
      dedicatedSupport: true,   // dedicated Slack channel + SLA
    },
    color: '#1A56DB',
    cta: 'Start Enterprise',
    ctaHref: '/checkout/enterprise',
    popular: false,
  },
};

// One-time add-on products
const ADDONS = {
  event_pack: {
    id: 'event_pack',
    name: 'Event Pack',
    description: 'One-time verification of a custom guard list for a specific event.',
    price: 450,
    stripePriceId: process.env.STRIPE_PRICE_EVENT_PACK,
    mode: 'payment',            // one-time, not subscription
    limits: {
      maxGuards: 500,
    },
    notes: [
      'No subscription required',
      'Verify up to 500 guards for one event',
      'PDF compliance report included',
      'Valid for 30 days from purchase',
    ],
  },
};

// Helper functions
const getPlan = (planId) => PLANS[planId] || PLANS.free;

/**
 * Explicit map: each subscription Price ID env → plan (`starter` | `business` | `enterprise`).
 * Monthly + annual for each tier must both be listed so checkout + webhooks resolve correctly.
 */
function buildSubscriptionPriceToPlanId() {
  /** @type {Record<string, 'starter' | 'business' | 'enterprise'>} */
  const map = Object.create(null);
  const pairs = [
    [process.env.STRIPE_PRICE_STARTER_MONTHLY, 'starter'],
    [process.env.STRIPE_PRICE_STARTER_ANNUAL, 'starter'],
    [process.env.STRIPE_PRICE_BUSINESS_MONTHLY, 'business'],
    [process.env.STRIPE_PRICE_BUSINESS_ANNUAL, 'business'],
    [process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY, 'enterprise'],
    [process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL, 'enterprise'],
  ];
  for (const [priceId, planKey] of pairs) {
    if (!priceId || typeof priceId !== 'string') continue;
    const pid = priceId.trim();
    if (!pid) continue;
    // If the same price id appears twice with different plans, last pair wins — use unique price ids in Stripe.
    map[pid] = planKey;
  }
  return map;
}

const subscriptionPriceToPlanId = buildSubscriptionPriceToPlanId();

const getPlanFromStripeId = (stripePriceId) => {
  if (!stripePriceId || typeof stripePriceId !== 'string') return PLANS.free;
  const pid = stripePriceId.trim();
  const planId = subscriptionPriceToPlanId[pid];
  if (planId) return PLANS[planId];

  const eventPack = process.env.STRIPE_PRICE_EVENT_PACK?.trim();
  if (eventPack && eventPack === pid) {
    // Event Pack is a one-time `payment` checkout, not a subscription tier.
    return PLANS.free;
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(
      `[plans] Unknown Stripe price id (set one of STRIPE_PRICE_* subscription env vars): ${pid}`
    );
  }
  return PLANS.free;
};

/** True when the subscription line item uses an *annual* price id (any tier). */
const isAnnual = (stripePriceId) => {
  if (!stripePriceId || typeof stripePriceId !== 'string') return false;
  const pid = stripePriceId.trim();
  const annualIds = [
    process.env.STRIPE_PRICE_STARTER_ANNUAL,
    process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
    process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  ]
    .filter(Boolean)
    .map((s) => s.trim());
  return annualIds.includes(pid);
};

const canSearch = (plan, monthlyUsage) => {
  const p = getPlan(plan);
  if (plan === 'free') return false; // daily limit handled separately
  if (!p.limits.searchesPerMonth) return true; // unlimited
  return monthlyUsage < p.limits.searchesPerMonth;
};

const canBatch = (plan) => getPlan(plan).limits.batchVerify;
const canUseApi = (plan) => getPlan(plan).limits.apiAccess;
const canNameSearch = (plan) => getPlan(plan).limits.nameSearch;

module.exports = {
  PLANS,
  ADDONS,
  getPlan,
  getPlanFromStripeId,
  isAnnual,
  canSearch,
  canBatch,
  canUseApi,
  canNameSearch,
};
