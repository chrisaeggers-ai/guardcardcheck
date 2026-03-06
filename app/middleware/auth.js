/**
 * GuardCardCheck — Auth & Plan Middleware
 */

const jwt = require('jsonwebtoken');
const { getPlan } = require('../config/plans');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

function requirePlan(minPlan) {
  const planOrder = ['free', 'starter', 'business', 'enterprise'];
  const minIndex = planOrder.indexOf(minPlan);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userPlan = req.user.plan || 'free';
    const userIndex = planOrder.indexOf(userPlan);

    if (userIndex < minIndex) {
      const planConfig = getPlan(minPlan);
      return res.status(403).json({
        error: `This feature requires a ${planConfig.name} plan or higher.`,
        requiredPlan: minPlan,
        currentPlan: userPlan,
        upgradeUrl: `https://guardcardcheck.com/checkout/${minPlan}`,
      });
    }

    next();
  };
}

function checkUsageLimit(db) {
  return async (req, res, next) => {
    if (!req.user) return next();

    const { id: userId, plan } = req.user;
    const planConfig = getPlan(plan);

    if (plan === 'free') {
      const { rows } = await db.query(
        `SELECT daily_searches, last_search_at FROM usage_stats
         WHERE user_id = $1 AND month_year = TO_CHAR(NOW(), 'YYYY-MM')`,
        [userId]
      );
      const usage = rows[0];
      const isNewDay = !usage?.last_search_at ||
        new Date(usage.last_search_at).toDateString() !== new Date().toDateString();
      const dailyCount = isNewDay ? 0 : (usage?.daily_searches || 0);

      if (dailyCount >= 1) {
        return res.status(429).json({
          error: 'Daily search limit reached for Free plan.',
          limit: 1,
          used: dailyCount,
          resetsAt: 'Tomorrow at midnight',
          upgradeUrl: 'https://guardcardcheck.com/checkout/starter',
        });
      }
      return next();
    }

    if (!planConfig.limits.searchesPerMonth) {
      return next(); // unlimited
    }

    const { rows } = await db.query(
      `SELECT COALESCE(monthly_searches, 0) AS monthly_searches 
       FROM usage_stats
       WHERE user_id = $1 AND month_year = TO_CHAR(NOW(), 'YYYY-MM')`,
      [userId]
    );
    const monthlyUsed = rows[0]?.monthly_searches || 0;

    if (monthlyUsed >= planConfig.limits.searchesPerMonth) {
      return res.status(429).json({
        error: `Monthly search limit reached for ${planConfig.name} plan.`,
        limit: planConfig.limits.searchesPerMonth,
        used: monthlyUsed,
        resetsAt: 'First of next month',
        upgradeUrl: `https://guardcardcheck.com/pricing`,
      });
    }

    req.monthlyUsed = monthlyUsed;
    next();
  };
}

function apiKeyAuth(db) {
  return async (req, res, next) => {
    // First try JWT
    const jwtToken = extractToken(req);
    if (jwtToken) {
      try {
        req.user = jwt.verify(jwtToken, JWT_SECRET);
        if (req.user.plan === 'enterprise') return next();
      } catch {}
    }

    // Then try API key
    const apiKey = req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer gcc_', '');

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required for this endpoint.' });
    }

    const crypto = require('crypto');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const { rows } = await db.query(`
      SELECT ak.id, ak.user_id, u.plan, u.organization_id, u.subscription_status
      FROM api_keys ak
      JOIN users u ON u.id = ak.user_id
      WHERE ak.key_hash = $1
        AND ak.revoked_at IS NULL
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    `, [keyHash]);

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid or expired API key.' });
    }

    const keyRecord = rows[0];

    if (keyRecord.plan !== 'enterprise') {
      return res.status(403).json({
        error: 'API access requires an Enterprise plan.',
        upgradeUrl: 'https://guardcardcheck.com/checkout/enterprise',
      });
    }

    if (keyRecord.subscription_status !== 'active') {
      return res.status(403).json({ error: 'Subscription is not active.' });
    }

    // Update last_used_at (non-blocking)
    db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyRecord.id]).catch(() => {});

    req.user = {
      id: keyRecord.user_id,
      plan: keyRecord.plan,
      organizationId: keyRecord.organization_id,
      apiKeyId: keyRecord.id,
      authMethod: 'api_key',
    };

    next();
  };
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies?.token || null;
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      plan: user.plan,
      organizationId: user.organization_id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = {
  authMiddleware,
  optionalAuth,
  requirePlan,
  checkUsageLimit,
  apiKeyAuth,
  signToken,
};
