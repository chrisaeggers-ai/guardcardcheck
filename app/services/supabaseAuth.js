/**
 * Maps Supabase Auth users to local `users` rows (Stripe, usage, orgs).
 */
const { createCustomer, stripe } = require('./stripe');

/**
 * @param {import('pg').Pool} db
 * @param {import('@supabase/supabase-js').User} supabaseUser
 */
async function syncLocalUserFromSupabase(db, supabaseUser) {
  const email = (supabaseUser.email || '').toLowerCase().trim();
  if (!email) {
    throw new Error('Supabase user has no email.');
  }

  const meta = supabaseUser.user_metadata || {};
  const firstName = meta.first_name || meta.firstName || null;
  const lastName = meta.last_name || meta.lastName || null;
  const organizationName = meta.organization_name || meta.organizationName || null;

  const sid = supabaseUser.id;

  const bySid = await db.query(
    'SELECT * FROM users WHERE supabase_user_id = $1',
    [sid]
  );
  if (bySid.rows.length) {
    const u = bySid.rows[0];
    await db.query(
      `UPDATE users SET last_login_at = NOW(), email_verified = COALESCE($2::boolean, email_verified), updated_at = NOW()
       WHERE id = $1`,
      [u.id, supabaseUser.email_confirmed_at ? true : null]
    ).catch(() => {});
    return { ...u, last_login_at: new Date() };
  }

  const byEmail = await db.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  if (byEmail.rows.length) {
    const u = byEmail.rows[0];
    await db.query(
      `UPDATE users SET supabase_user_id = $2, last_login_at = NOW(),
       email_verified = COALESCE($3::boolean, email_verified), updated_at = NOW()
       WHERE id = $1`,
      [u.id, sid, supabaseUser.email_confirmed_at ? true : null]
    );
    return { ...u, supabase_user_id: sid };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let stripeCustomerId = null;
    try {
      const customer = await createCustomer({
        email,
        name: `${firstName || ''} ${lastName || ''}`.trim() || email,
        organizationName,
        userId: 'pending',
      });
      stripeCustomerId = customer.id;
    } catch (stripeErr) {
      console.warn('[SupabaseAuth] Stripe customer creation failed (non-fatal):', stripeErr.message);
    }

    let orgId = null;
    if (organizationName) {
      const slug = `${organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100)}-${Date.now().toString(36)}`;
      const orgResult = await client.query(
        'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
        [organizationName, slug]
      );
      orgId = orgResult.rows[0].id;
    }

    const userResult = await client.query(
      `
      INSERT INTO users (
        email, password_hash, supabase_user_id, first_name, last_name,
        organization_id, stripe_customer_id, plan, role, email_verified
      ) VALUES ($1, NULL, $2, $3, $4, $5, $6, 'free', 'owner', $7)
      RETURNING id, email, first_name, last_name, plan, role, stripe_customer_id,
                organization_id, subscription_status, created_at, supabase_user_id
    `,
      [
        email,
        sid,
        firstName,
        lastName,
        orgId,
        stripeCustomerId,
        !!supabaseUser.email_confirmed_at,
      ]
    );

    const user = userResult.rows[0];

    if (stripeCustomerId) {
      stripe.customers.update(stripeCustomerId, {
        metadata: { userId: user.id, organizationName },
      }).catch(() => {});
    }

    await client.query(
      `
      INSERT INTO usage_stats (user_id, month_year)
      VALUES ($1, TO_CHAR(NOW(), 'YYYY-MM'))
      ON CONFLICT DO NOTHING
    `,
      [user.id]
    );

    await client.query('COMMIT');
    return user;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  syncLocalUserFromSupabase,
};
