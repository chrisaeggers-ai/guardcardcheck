/**
 * GuardCardCheck — Auth Routes
 *
 * POST /api/auth/register   — Create account + Stripe customer
 * POST /api/auth/login      — Login, return JWT
 * GET  /api/auth/me         — Return current user + plan info
 * POST /api/auth/logout     — Clear cookie
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authMiddleware, signToken } = require('../middleware/auth');
const { createCustomer } = require('../services/stripe');
const { getPlan } = require('../config/plans');

// ─────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { email, password, firstName, lastName, organizationName }
 *
 * Flow:
 *   1. Validate input
 *   2. Hash password
 *   3. Create Stripe customer (so checkout works immediately)
 *   4. Insert user into DB
 *   5. Return JWT
 */
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, organizationName } = req.body;
  const db = req.app.get('db');

  // Validate
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Check email uniqueness
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create Stripe customer first (so we have the ID for the user row)
    let stripeCustomerId = null;
    try {
      const customer = await createCustomer({
        email: email.toLowerCase().trim(),
        name: `${firstName || ''} ${lastName || ''}`.trim() || email,
        organizationName,
        userId: 'pending', // will update after insert
      });
      stripeCustomerId = customer.id;
    } catch (stripeErr) {
      console.warn('[Auth] Stripe customer creation failed (non-fatal):', stripeErr.message);
      // Continue — user can still register; billing will create customer on first checkout
    }

    // Create organization if name provided
    let orgId = null;
    if (organizationName) {
      const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100)
        + '-' + Date.now().toString(36);
      const orgResult = await client.query(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        [organizationName, slug]
      );
      orgId = orgResult.rows[0].id;
    }

    // Insert user
    const userResult = await client.query(`
      INSERT INTO users (
        email, password_hash, first_name, last_name,
        organization_id, stripe_customer_id, plan, role
      ) VALUES ($1, $2, $3, $4, $5, $6, 'free', 'owner')
      RETURNING id, email, first_name, last_name, plan, role, stripe_customer_id, created_at
    `, [
      email.toLowerCase().trim(),
      passwordHash,
      firstName || null,
      lastName || null,
      orgId,
      stripeCustomerId,
    ]);

    const user = userResult.rows[0];

    // Update Stripe customer metadata with real userId
    if (stripeCustomerId) {
      const { stripe } = require('../services/stripe');
      stripe.customers.update(stripeCustomerId, {
        metadata: { userId: user.id, organizationName },
      }).catch(() => {});
    }

    // Initialize usage stats
    await client.query(`
      INSERT INTO usage_stats (user_id, month_year) 
      VALUES ($1, TO_CHAR(NOW(), 'YYYY-MM'))
      ON CONFLICT DO NOTHING
    `, [user.id]);

    await client.query('COMMIT');

    const token = signToken({ ...user, stripeCustomerId });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        plan: user.plan,
        role: user.role,
      },
      token,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Auth] Registration error:', error.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = req.app.get('db');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { rows } = await db.query(`
      SELECT u.*, o.name AS organization_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = $1
    `, [email.toLowerCase().trim()]);

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Update last login
    db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});

    const token = signToken({
      id: user.id,
      email: user.email,
      plan: user.plan,
      organization_id: user.organization_id,
      role: user.role,
      stripeCustomerId: user.stripe_customer_id,
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        plan: user.plan,
        planName: getPlan(user.plan).name,
        organizationName: user.organization_name,
        role: user.role,
        subscriptionStatus: user.subscription_status,
      },
      token,
    });

  } catch (error) {
    console.error('[Auth] Login error:', error.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Me
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Returns current user profile + plan details
 */
router.get('/me', authMiddleware, async (req, res) => {
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
    const planConfig = getPlan(user.plan);

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      organizationName: user.organization_name,
      role: user.role,
      plan: user.plan,
      planName: planConfig.name,
      planLimits: planConfig.limits,
      subscriptionStatus: user.subscription_status,
      billingInterval: user.billing_interval,
      planExpiresAt: user.plan_expires_at,
      usage: {
        monthlySearches: user.monthly_searches,
        monthlyLimit: planConfig.limits.searchesPerMonth,
        totalSearches: user.total_searches,
      },
      hasStripe: !!user.stripe_customer_id,
      createdAt: user.created_at,
    });

  } catch (error) {
    console.error('[Auth] /me error:', error.message);
    res.status(500).json({ error: 'Failed to load profile.' });
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

