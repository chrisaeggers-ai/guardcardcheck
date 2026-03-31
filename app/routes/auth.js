/**
 * GuardCardCheck — Auth Routes
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * POST /api/auth/logout
 *
 * When Supabase is configured (SUPABASE_URL + SUPABASE_ANON_KEY):
 *   - sign-up / sign-in handled by Supabase
 *   - no local DB required for auth
 * When Supabase is not configured:
 *   - falls back to bcrypt + local PostgreSQL
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authMiddleware, signToken } = require('../middleware/auth');
const { getPlan } = require('../config/plans');
const { signInWithPassword, signUp } = require('../services/supabase');

const COOKIE_MAX_AGE_MS = Math.min(30 * 24 * 60 * 60 * 1000, 2147483647);

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

/** Build and send a JWT response from a Supabase user object (no DB required). */
function sendAuthJsonFromSupabase(res, sbUser, status = 200) {
  const meta = sbUser.user_metadata || {};
  const plan = meta.plan || 'free';
  const token = signToken({
    id: sbUser.id,
    email: sbUser.email,
    plan,
    organization_id: meta.organization_id || null,
    role: meta.role || 'owner',
  });
  res.cookie('token', token, cookieOpts());
  const payload = {
    user: {
      id: sbUser.id,
      email: sbUser.email,
      firstName: meta.first_name || meta.firstName || '',
      lastName: meta.last_name || meta.lastName || '',
      plan,
      planName: getPlan(plan).name,
      organizationName: meta.organization_name || '',
      role: meta.role || 'owner',
      subscriptionStatus: meta.subscription_status || 'inactive',
    },
    token,
  };
  return status === 201 ? res.status(201).json(payload) : res.json(payload);
}

/** Build and send a JWT response from a local DB user row. */
function sendAuthJsonFromDb(res, user, status = 200) {
  const plan = user.plan || 'free';
  const token = signToken({
    id: user.id,
    email: user.email,
    plan,
    organization_id: user.organization_id || null,
    role: user.role || 'owner',
  });
  res.cookie('token', token, cookieOpts());
  const payload = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      plan,
      planName: getPlan(plan).name,
      organizationName: user.organization_name || '',
      role: user.role || 'owner',
      subscriptionStatus: user.subscription_status || 'inactive',
    },
    token,
  };
  return status === 201 ? res.status(201).json(payload) : res.json(payload);
}

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, organizationName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // ── Supabase path ──────────────────────────────────────────
  const sbUp = await signUp(normalizedEmail, password, {
    first_name: firstName || '',
    last_name: lastName || '',
    organization_name: organizationName || '',
  });

  if (sbUp.user) {
    return sendAuthJsonFromSupabase(res, sbUp.user, 201);
  }

  if (sbUp.error && sbUp.error !== 'not_configured') {
    const msg = sbUp.error.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    return res.status(400).json({ error: sbUp.error });
  }

  // ── bcrypt + DB fallback ───────────────────────────────────
  const db = req.app.get('db');
  const client = await db.connect().catch(() => null);
  if (!client) {
    return res.status(503).json({ error: 'Authentication service unavailable. Please configure Supabase (SUPABASE_URL + SUPABASE_ANON_KEY).' });
  }

  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let stripeCustomerId = null;
    try {
      const { createCustomer } = require('../services/stripe');
      const customer = await createCustomer({ email: normalizedEmail, name: `${firstName || ''} ${lastName || ''}`.trim() || normalizedEmail, organizationName, userId: 'pending' });
      stripeCustomerId = customer.id;
    } catch {}

    let orgId = null;
    if (organizationName) {
      const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100) + '-' + Date.now().toString(36);
      const orgResult = await client.query('INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id', [organizationName, slug]);
      orgId = orgResult.rows[0].id;
    }

    const { rows: [user] } = await client.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, organization_id, stripe_customer_id, plan, role)
      VALUES ($1, $2, $3, $4, $5, $6, 'free', 'owner')
      RETURNING id, email, first_name, last_name, plan, role, organization_id, stripe_customer_id
    `, [normalizedEmail, passwordHash, firstName || null, lastName || null, orgId, stripeCustomerId]);

    await client.query(`INSERT INTO usage_stats (user_id, month_year) VALUES ($1, TO_CHAR(NOW(),'YYYY-MM')) ON CONFLICT DO NOTHING`, [user.id]);
    await client.query('COMMIT');

    return sendAuthJsonFromDb(res, user, 201);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Auth] Registration error:', error.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // ── Supabase path ──────────────────────────────────────────
  const sb = await signInWithPassword(normalizedEmail, password);

  if (sb.user) {
    return sendAuthJsonFromSupabase(res, sb.user);
  }

  if (sb.error && sb.error !== 'not_configured') {
    // Supabase returned a real auth error (wrong credentials, etc.)
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // ── bcrypt + DB fallback ───────────────────────────────────
  const db = req.app.get('db');
  try {
    const { rows } = await db.query(`
      SELECT u.*, o.name AS organization_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = $1
    `, [normalizedEmail]);

    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});
    return sendAuthJsonFromDb(res, user);
  } catch (error) {
    if (String(error.message).includes('disabled')) {
      return res.status(503).json({ error: 'Authentication service unavailable. Please configure Supabase (SUPABASE_URL + SUPABASE_ANON_KEY).' });
    }
    console.error('[Auth] Login error:', error.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Me — returns current user info from JWT (+ DB if available)
// ─────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  const planConfig = getPlan(req.user.plan || 'free');

  // Try to enrich from DB; if DB is unavailable just return JWT claims
  const db = req.app.get('db');
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.plan, u.role,
             u.subscription_status, u.billing_interval, u.plan_expires_at,
             u.stripe_customer_id, u.created_at,
             o.name AS organization_name,
             COALESCE(us.monthly_searches, 0) AS monthly_searches,
             COALESCE(us.total_searches, 0) AS total_searches
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      LEFT JOIN usage_stats us ON us.user_id = u.id
        AND us.month_year = TO_CHAR(NOW(), 'YYYY-MM')
      WHERE u.id = $1
    `, [req.user.id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = rows[0];
    const pc = getPlan(user.plan);
    return res.json({
      id: user.id, email: user.email,
      firstName: user.first_name, lastName: user.last_name,
      organizationName: user.organization_name, role: user.role,
      plan: user.plan, planName: pc.name, planLimits: pc.limits,
      subscriptionStatus: user.subscription_status,
      billingInterval: user.billing_interval, planExpiresAt: user.plan_expires_at,
      usage: { monthlySearches: user.monthly_searches, monthlyLimit: pc.limits.searchesPerMonth, totalSearches: user.total_searches },
      hasStripe: !!user.stripe_customer_id, createdAt: user.created_at,
    });
  } catch {
    // DB unavailable — return from JWT
    return res.json({
      id: req.user.id,
      email: req.user.email,
      firstName: '', lastName: '', organizationName: '',
      role: req.user.role || 'owner',
      plan: req.user.plan || 'free',
      planName: planConfig.name,
      planLimits: planConfig.limits,
      subscriptionStatus: 'inactive',
      usage: { monthlySearches: 0, monthlyLimit: planConfig.limits.searchesPerMonth, totalSearches: 0 },
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

module.exports = router;
