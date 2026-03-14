/**
 * GuardCardCheck.com — Production Server
 * Node.js / Express / PostgreSQL
 *
 * Routes served:
 *   GET  /                   → Homepage
 *   GET  /verify             → Public license search
 *   GET  /pricing            → Pricing page
 *   GET  /login              → Login page
 *   GET  /register           → Register page
 *   GET  /dashboard          → Dashboard (auth-gated client-side)
 *   GET  /checkout/success   → Post-payment confirmation
 *
 *   POST /api/auth/register  → Create account + Stripe customer
 *   POST /api/auth/login     → Login, get JWT
 *   GET  /api/auth/me        → Current user + plan info
 *
 *   GET  /api/states         → All 10 supported states
 *   POST /api/verify         → Single license verification
 *   GET  /api/search         → Name search across states
 *   POST /api/verify/batch   → Bulk roster verification
 *
 *   GET  /api/billing/plans        → Plan configs + pricing
 *   POST /api/billing/checkout/:id → Create Stripe Checkout session
 *   POST /api/billing/event-pack   → Event Pack one-time checkout
 *   GET  /api/billing/portal       → Stripe Customer Portal URL
 *   GET  /api/billing/subscription → Current subscription details
 *   GET  /api/billing/invoices     → Invoice history
 *   GET  /api/billing/usage        → Monthly usage stats
 *   POST /api/billing/webhook      → Stripe webhook (raw body — mounted first)
 *
 *   GET  /health             → Health check
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { Pool }   = require('pg');
const cron       = require('node-cron');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// ─────────────────────────────────────────────────────────────
// Database (optional for local dev)
// - Default is DISABLE_DB=true in `npm run dev` (see package.json)
// - Enable DB by running with DISABLE_DB=false and DATABASE_URL set
// ─────────────────────────────────────────────────────────────
const dbEnabled = !!process.env.DATABASE_URL && process.env.DISABLE_DB !== 'true';
let db;

if (dbEnabled) {
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  db.connect()
    .then(c => { c.release(); console.log('✅ PostgreSQL connected'); })
    .catch(err => { console.error('❌ PostgreSQL connection failed:', err.message); process.exit(1); });
} else {
  db = {
    async query() {
      throw new Error('Database is disabled (no DATABASE_URL set or DISABLE_DB=true).');
    },
  };
  console.log('⚠️ PostgreSQL disabled — skipping connection (set DATABASE_URL and DISABLE_DB=false to enable).');
}

app.set('db', db);

// ─────────────────────────────────────────────────────────────
// ⚠️  STRIPE WEBHOOK — must be mounted BEFORE express.json()
// Stripe requires the raw Buffer body for signature verification.
// ─────────────────────────────────────────────────────────────
const billingRouter = require('./routes/billing');
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => { req.url = '/webhook'; billingRouter(req, res, next); }
);

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://fonts.googleapis.com"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      frameSrc:    ["https://js.stripe.com", "https://hooks.stripe.com"],
      connectSrc:  ["'self'", "https://api.stripe.com"],
      imgSrc:      ["'self'", "data:", "https:"],
    },
  },
}));
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://guardcardcheck.com',
    'https://www.guardcardcheck.com',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// www → apex redirect
app.use((req, res, next) => {
  if (req.headers.host === 'www.guardcardcheck.com') {
    return res.redirect(301, `https://guardcardcheck.com${req.url}`);
  }
  next();
});

// Request logger (API routes only)
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    const t = Date.now();
    res.on('finish', () => {
      const c = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`${c}[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now()-t}ms)\x1b[0m`);
    });
    next();
  });
}

// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/billing', billingRouter);       // webhook already mounted above
app.use('/api',         require('./routes/verify'));

// Health check
app.get('/health', async (req, res) => {
  let dbOk = false;
  try { await db.query('SELECT 1'); dbOk = true; } catch {}
  res.json({
    status:    dbOk ? 'ok' : 'degraded',
    version:   '2.0.0',
    states:    10,
    db:        dbOk ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// Static HTML Pages (all served from /public)
// ─────────────────────────────────────────────────────────────
const page = (name) => (req, res) => res.sendFile(path.join(PUBLIC, name));

app.get('/',                  page('index.html'));
app.get('/verify',            page('verify.html'));
app.get('/pricing',           page('pricing.html'));
app.get('/login',             page('login.html'));
app.get('/register',          page('register.html'));
app.get('/dashboard',         page('dashboard.html'));
app.get('/checkout/success',  page('checkout-success.html'));

// Static assets (CSS, JS, images if any)
app.use(express.static(PUBLIC));

// ─────────────────────────────────────────────────────────────
// 404 / Error Handlers
// ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).sendFile(path.join(PUBLIC, 'index.html')); // SPA fallback
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).send('Something went wrong');
});

// ─────────────────────────────────────────────────────────────
// Cron Jobs
// ─────────────────────────────────────────────────────────────

// Daily 2:00 AM PT — send expiry alert emails for tracked guards
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Running expiry alert check...');
  try {
    const { rows } = await db.query(`
      SELECT rg.id, rg.guard_name, rg.state_code, rg.license_number, rg.last_expiry,
             u.email, u.first_name
      FROM roster_guards rg
      JOIN rosters r ON r.id = rg.roster_id
      JOIN users u ON u.id = r.created_by
      WHERE rg.alert_enabled = TRUE
        AND rg.last_status = 'ACTIVE'
        AND rg.last_expiry BETWEEN NOW() AND NOW() + (rg.alert_days_before || ' days')::INTERVAL
        AND u.plan IN ('starter', 'business', 'enterprise')
        AND NOT EXISTS (
          SELECT 1 FROM alerts a
          WHERE a.roster_guard_id = rg.id
            AND a.created_at > NOW() - INTERVAL '7 days'
        )
    `);

    for (const g of rows) {
      const days = Math.ceil((new Date(g.last_expiry) - new Date()) / 86400000);
      const type = days <= 30 ? 'expiring_30' : 'expiring_60';
      await db.query(`
        INSERT INTO alerts (user_id, roster_guard_id, alert_type, state_code, license_number, guard_name, expiration_date, email_sent_to)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [g.id, g.id, type, g.state_code, g.license_number, g.guard_name, g.last_expiry, g.email]);
      console.log(`[CRON] Alert: ${g.guard_name} (${g.state_code}) expires in ${days}d → ${g.email}`);
      // TODO: wire to Postmark/SendGrid for actual email delivery
    }
    console.log(`[CRON] Processed ${rows.length} expiry alerts`);
  } catch (err) {
    console.error('[CRON] Alert check failed:', err.message);
  }
}, { timezone: 'America/Los_Angeles' });

// Daily 2:30 AM PT — re-verify roster guards expiring within 60 days
cron.schedule('30 2 * * *', async () => {
  console.log('[CRON] Re-verifying expiring roster guards...');
  try {
    const { verifyLicense } = require('./services/verificationEngine');
    const { rows } = await db.query(`
      SELECT id, state_code, license_number
      FROM roster_guards
      WHERE last_expiry < NOW() + INTERVAL '60 days'
        AND (last_verified IS NULL OR last_verified < NOW() - INTERVAL '24 hours')
      LIMIT 500
    `);
    for (const g of rows) {
      try {
        const result = await verifyLicense(g.state_code, g.license_number, { useCache: false });
        await db.query(`
          UPDATE roster_guards
          SET last_status=$1, last_expiry=$2, is_armed=$3, last_verified=NOW(), updated_at=NOW()
          WHERE id=$4
        `, [result.status, result.expirationDate, result.isArmed || false, g.id]);
      } catch {}
      await new Promise(r => setTimeout(r, 300)); // gentle throttle
    }
    console.log(`[CRON] Re-verified ${rows.length} guards`);
  } catch (err) {
    console.error('[CRON] Re-verify failed:', err.message);
  }
}, { timezone: 'America/Los_Angeles' });

// 1st of month 3:00 AM PT — reset monthly usage counters
cron.schedule('0 3 1 * *', async () => {
  try {
    await db.query(`
      INSERT INTO usage_stats (user_id, month_year)
        SELECT id, TO_CHAR(NOW(),'YYYY-MM') FROM users
      ON CONFLICT (user_id, month_year) DO UPDATE
        SET monthly_searches=0, reset_at=NOW()
    `);
    console.log('[CRON] Monthly usage counters reset');
  } catch (err) {
    console.error('[CRON] Usage reset failed:', err.message);
  }
}, { timezone: 'America/Los_Angeles' });

// ─────────────────────────────────────────────────────────────
// Start + graceful shutdown (Ctrl+C releases port)
// ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║         GuardCardCheck.com  v2.0  — Production           ║
╠══════════════════════════════════════════════════════════╣
║  🌐  http://localhost:${String(PORT).padEnd(4)}                          ║
║  💳  http://localhost:${String(PORT).padEnd(4)}/pricing                  ║
║  🔍  http://localhost:${String(PORT).padEnd(4)}/verify                   ║
║  ❤️   http://localhost:${String(PORT).padEnd(4)}/health                   ║
╠══════════════════════════════════════════════════════════╣
║  States: CA · FL · TX · IL · VA · NV · OR · WA · AZ · NC║
║  DB:     ${(process.env.DATABASE_URL ? '✅ Connected' : '⚠️  No DATABASE_URL').padEnd(47)}║
║  Stripe: ${(process.env.STRIPE_SECRET_KEY ? '✅ Configured' : '⚠️  No STRIPE_SECRET_KEY').padEnd(47)}║
║  DCA:    ${(process.env.DCA_API_KEY ? '✅ Key set' : '⏳  Pending DCA approval').padEnd(47)}║
╚══════════════════════════════════════════════════════════╝`);
});

function shutdown() {
  console.log('\nShutting down...');
  server.close(() => {
    console.log('Server closed. Port', PORT, 'released.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
