/**
 * GuardCardCheck — Multi-State Verification API Routes
 * 
 * POST /api/verify          — Verify a single license
 * POST /api/verify/batch    — Verify a roster (Business/Enterprise)
 * GET  /api/search          — Search by name across states
 * GET  /api/states          — List all supported states
 * GET  /api/states/:code    — Get state-specific info and license types
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { verifyLicense, searchByName, verifyRoster, getSupportedStates } = require('../services/verificationEngine');
const { getState } = require('../config/states');
const { authMiddleware } = require('../middleware/auth');

// ============================================================
// Rate Limiters by Tier
// ============================================================
const freeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,  // 24 hours
  max: 1,
  message: { error: 'Free tier is limited to 1 search per day. Upgrade to Starter for 25 searches/month.' },
  keyGenerator: (req) => req.ip,
  skip: (req) => req.user?.plan !== 'free',
});

const starterLimiter = rateLimit({
  windowMs: 30 * 24 * 60 * 60 * 1000,  // 30 days
  max: 25,
  message: { error: 'Monthly search limit reached. Upgrade to Business for 200 searches/month.' },
  keyGenerator: (req) => req.user?.id || req.ip,
  skip: (req) => !req.user || req.user.plan !== 'starter',
});

// ============================================================
// Routes
// ============================================================

/**
 * GET /api/states
 * List all 10 supported states with their regulatory metadata
 */
router.get('/states', (req, res) => {
  const states = getSupportedStates();
  res.json({
    total: states.length,
    states,
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * GET /api/states/:code
 * Get detailed info for a specific state
 */
router.get('/states/:code', (req, res) => {
  const stateConfig = getState(req.params.code);
  if (!stateConfig) {
    return res.status(404).json({
      error: `State ${req.params.code.toUpperCase()} not found or not supported`,
    });
  }
  res.json({
    ...stateConfig,
    // Don't expose internal access config
    access: {
      type: stateConfig.access.type,
      portalUrl: stateConfig.access.portalUrl,
    },
  });
});

/**
 * POST /api/verify
 * Verify a single license number in a specific state
 * 
 * Body: { stateCode: 'CA', licenseNumber: 'G1234567' }
 * 
 * Auth: Optional — free tier gets 1/day without auth, paid tiers require JWT
 */
router.post('/verify', freeLimiter, starterLimiter, async (req, res) => {
  const { stateCode, licenseNumber } = req.body;

  if (!stateCode || !licenseNumber) {
    return res.status(400).json({
      error: 'Both stateCode and licenseNumber are required',
      example: { stateCode: 'CA', licenseNumber: 'G1234567' },
    });
  }

  const cleanState = stateCode.trim().toUpperCase();
  const cleanLicense = licenseNumber.trim();

  if (cleanState.length !== 2) {
    return res.status(400).json({ error: 'stateCode must be a 2-letter state abbreviation (e.g. "CA", "FL")' });
  }

  try {
    const result = await verifyLicense(cleanState, cleanLicense, {
      useCache: true,
    });
    
    // Log for analytics (non-blocking)
    logVerification(req, cleanState, cleanLicense, result.status).catch(() => {});
    
    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification service temporarily unavailable. Please try again.' });
  }
});

/**
 * POST /api/search-public
 * Public name search — single state, max 10 results, no auth required.
 */
router.post('/search-public', freeLimiter, async (req, res) => {
  const { firstName, lastName, stateCode } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName are required.' });
  if (!stateCode) return res.status(400).json({ error: 'stateCode is required.' });

  try {
    const results = await searchByName(firstName.trim(), lastName.trim(), [stateCode.trim().toUpperCase()]);
    res.json({ query: { firstName, lastName, stateCode }, total: results.length, results: results.slice(0, 10) });
  } catch (error) {
    console.error('Public name search error:', error.message);
    res.status(500).json({ error: 'Search service temporarily unavailable.' });
  }
});

/**
 * GET /api/search?firstName=John&lastName=Smith&states=CA,FL,TX
 * Search by guard name across one or multiple states
 * Requires Starter plan or above
 */
router.get('/search', authMiddleware, starterLimiter, async (req, res) => {
  const { firstName, lastName, states } = req.query;

  if (!firstName || !lastName) {
    return res.status(400).json({
      error: 'firstName and lastName are required query parameters',
    });
  }

  // Parse states param — e.g. "CA,FL,TX" or "ALL"
  const stateCodes = states === 'ALL' || !states
    ? 'ALL'
    : states.split(',').map(s => s.trim().toUpperCase());

  // Limit name search to max 5 states for non-Enterprise
  if (Array.isArray(stateCodes) && stateCodes.length > 5 && req.user?.plan !== 'enterprise') {
    return res.status(403).json({
      error: 'Multi-state name search is limited to 5 states for Business plan. Upgrade to Enterprise for unlimited.',
    });
  }

  try {
    const results = await searchByName(firstName.trim(), lastName.trim(), stateCodes);
    res.json({
      query: { firstName, lastName, states: stateCodes },
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('Name search error:', error);
    res.status(500).json({ error: 'Search service temporarily unavailable.' });
  }
});

/**
 * POST /api/verify/batch
 * Verify a roster of guards — Business/Enterprise tier only
 * 
 * Body: { 
 *   roster: [{ stateCode: 'CA', licenseNumber: 'G123', guardName: 'John Smith' }, ...]
 * }
 */
router.post('/verify/batch', authMiddleware, async (req, res) => {
  const { plan } = req.user || {};
  
  if (!['business', 'enterprise'].includes(plan)) {
    return res.status(403).json({
      error: 'Batch verification requires a Business or Enterprise plan.',
      upgradeUrl: 'https://guardcardcheck.com/pricing',
    });
  }

  const { roster } = req.body;

  if (!Array.isArray(roster) || roster.length === 0) {
    return res.status(400).json({ error: 'roster must be a non-empty array' });
  }

  // Guard limits by plan
  const maxGuards = plan === 'enterprise' ? 5000 : 200;
  if (roster.length > maxGuards) {
    return res.status(400).json({
      error: `${plan} plan supports up to ${maxGuards} guards per batch. Your roster has ${roster.length} entries.`,
    });
  }

  // Validate each entry
  const invalid = roster.filter((g, i) => !g.stateCode || !g.licenseNumber);
  if (invalid.length > 0) {
    return res.status(400).json({
      error: `${invalid.length} roster entries are missing stateCode or licenseNumber`,
    });
  }

  try {
    const result = await verifyRoster(roster);
    res.json({
      ...result,
      verifiedAt: new Date().toISOString(),
      plan,
    });
  } catch (error) {
    console.error('Batch verification error:', error);
    res.status(500).json({ error: 'Batch verification service temporarily unavailable.' });
  }
});

/**
 * POST /api/verify/event-pack
 * One-time event guard list verification — Event Pack add-on product
 * $49 per event, no subscription required
 * 
 * Body: {
 *   eventName: 'Super Bowl Security - Feb 2026',
 *   guards: [{ stateCode, licenseNumber, role }]
 * }
 */
router.post('/verify/event-pack', async (req, res) => {
  // Check event pack has been purchased (Stripe check)
  const eventPackToken = req.headers['x-event-pack-token'];
  if (!eventPackToken) {
    return res.status(403).json({
      error: 'Event Pack verification requires a valid event pack token.',
      purchaseUrl: 'https://guardcardcheck.com/event-pack',
      price: '$49 per event — no subscription required',
    });
  }

  // Validate token (stub — replace with actual Stripe/DB check)
  const isValid = await validateEventPackToken(eventPackToken);
  if (!isValid) {
    return res.status(403).json({ error: 'Invalid or expired event pack token.' });
  }

  const { eventName, guards } = req.body;
  if (!guards || !Array.isArray(guards)) {
    return res.status(400).json({ error: 'guards array is required' });
  }
  if (guards.length > 500) {
    return res.status(400).json({ error: 'Event packs support up to 500 guards per event.' });
  }

  try {
    const result = await verifyRoster(guards);
    res.json({
      eventName,
      ...result,
      verifiedAt: new Date().toISOString(),
      product: 'Event Pack',
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification service temporarily unavailable.' });
  }
});

// ============================================================
// Helpers
// ============================================================

async function validateEventPackToken(token) {
  // TODO: validate against DB/Stripe — stub returns true
  return token && token.startsWith('ep_');
}

async function logVerification(req, stateCode, licenseNumber, resultStatus) {
  // TODO: write to analytics DB
  const log = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userId: req.user?.id,
    plan: req.user?.plan || 'free',
    stateCode,
    licenseNumber: licenseNumber.substring(0, 4) + '***', // partial for privacy
    resultStatus,
  };
  // await db.query('INSERT INTO verification_logs SET ?', log);
  console.log('[analytics]', JSON.stringify(log));
}

module.exports = router;
