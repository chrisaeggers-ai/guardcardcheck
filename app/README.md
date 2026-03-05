# GuardCardCheck.com

**10-State Security Guard License Verification Platform**

Real-time guard card, firearm permit, and PPO license verification across CA, FL, TX, IL, VA, NV, OR, WA, AZ, and NC. Built for Private Patrol Operators to stay compliant and avoid licensing liability.

---

## What's In This Repo

```
guardcardcheck/
│
├── public/                     ← All frontend pages
│   ├── index.html              → Homepage (/)
│   ├── verify.html             → Public license search (/verify)
│   ├── pricing.html            → Pricing page (/pricing)
│   ├── login.html              → Login (/login)
│   ├── register.html           → Register (/register)
│   ├── dashboard.html          → User dashboard (/dashboard)
│   └── checkout-success.html   → Post-payment (/checkout/success)
│
├── routes/
│   ├── auth.js                 → Register, login, /me, logout
│   ├── billing.js              → Stripe checkout, portal, webhook, invoices
│   └── verify.js               → License verification API endpoints
│
├── services/
│   ├── stripe.js               → All Stripe operations (checkout, webhooks, portal)
│   ├── verificationEngine.js   → Routes requests to correct state adapter
│   ├── adapters/
│   │   └── BaseStateAdapter.js → Base class all state scrapers extend
│   └── states/
│       ├── california.js       → CA — DCA official API (plug in key when approved)
│       ├── florida.js          → FL — FDACS portal + bulk records
│       ├── texas.js            → TX — TOPS/DPS portal
│       ├── remaining-states.js → IL, VA, NV, OR, WA, AZ, NC — portal scrapers
│       └── DCA_INTEGRATION_NOTES.js → Calibration guide for when DCA key arrives
│
├── middleware/
│   └── auth.js                 → JWT verification, plan gating, usage limits
│
├── config/
│   ├── plans.js                → Plan definitions, limits, Stripe Price IDs
│   └── states.js               → All 10 states — agencies, portals, license types
│
├── db/
│   └── schema.sql              → Complete PostgreSQL schema
│
├── server.js                   → Express app entry point
├── package.json
├── .env.example                → All required environment variables
├── .gitignore
└── DEPLOY.md                   → Step-by-step Railway deployment guide
```

---

## Launch in 5 Steps

### Prerequisites
- Node.js 18+ (`node --version`)
- A [Railway](https://railway.app) account (free to start)
- A [Stripe](https://dashboard.stripe.com) account
- Your domain purchased (Namecheap, GoDaddy, Cloudflare, etc.)

---

### Step 1 — Configure Stripe (20 min)

**1.1 Create 4 Products in Stripe Dashboard → Products:**

| Product | Monthly Price | Annual Price |
|---------|--------------|-------------|
| GuardCardCheck Starter | $29/mo | $290/yr |
| GuardCardCheck Business | $79/mo | $790/yr |
| GuardCardCheck Enterprise | $199/mo | $1,990/yr |
| GuardCardCheck Event Pack | $49 one-time | — |

After creating each product, copy the `price_xxx` IDs into your `.env`.

**1.2 Configure Customer Portal** → Settings → Billing → Customer Portal:
- ✅ Cancel subscriptions
- ✅ Upgrade/downgrade plans
- ✅ Update payment method
- ✅ View invoice history

**1.3 Get API Keys** → Developers → API Keys:
- `pk_live_xxx` → `STRIPE_PUBLISHABLE_KEY`
- `sk_live_xxx` → `STRIPE_SECRET_KEY`

> Use `sk_test_` / `pk_test_` while testing, switch to `sk_live_` / `pk_live_` when going live.

---

### Step 2 — Deploy to Railway (10 min)

**2.1 Push code to GitHub:**
```bash
git init
git add .
git commit -m "Initial GuardCardCheck deploy"
git remote add origin https://github.com/YOUR_USERNAME/guardcardcheck.git
git push -u origin main
```

**2.2 Create Railway project:**
1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub → select your repo
3. Railway detects Node.js and deploys automatically

**2.3 Add PostgreSQL:**
- In Railway project → **+ New** → **Database** → **PostgreSQL**
- Railway auto-sets `DATABASE_URL` as an env var

**2.4 Set environment variables** in Railway → your service → **Variables**:
```
NODE_ENV=production
BASE_URL=https://guardcardcheck.com
ALLOWED_ORIGINS=https://guardcardcheck.com,https://www.guardcardcheck.com
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx   ← fill after Step 3
STRIPE_PRICE_STARTER_MONTHLY=price_xxx
STRIPE_PRICE_STARTER_ANNUAL=price_xxx
STRIPE_PRICE_BUSINESS_MONTHLY=price_xxx
STRIPE_PRICE_BUSINESS_ANNUAL=price_xxx
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_xxx
STRIPE_PRICE_ENTERPRISE_ANNUAL=price_xxx
STRIPE_PRICE_EVENT_PACK=price_xxx
DCA_API_KEY=          ← leave blank until DCA approves you
```

**2.5 Run the database schema:**
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway run psql $DATABASE_URL -f db/schema.sql
```

---

### Step 3 — Set Up Stripe Webhooks (5 min)

**3.1 Create webhook** → Stripe Dashboard → Developers → Webhooks → Add Endpoint:
- URL: `https://guardcardcheck.com/api/billing/webhook`
- Select events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.trial_will_end`
  - `charge.dispute.created`

**3.2 Copy the webhook signing secret** (`whsec_xxx`) → add to Railway env vars as `STRIPE_WEBHOOK_SECRET`. Railway redeploys automatically.

**3.3 Test it:**
Stripe Dashboard → Webhooks → your endpoint → Send test event → `checkout.session.completed`
Check Railway logs: should see `[Stripe Webhook] checkout.session.completed`

---

### Step 4 — Custom Domain + SSL (5 min)

**4.1** Railway → your service → Settings → Domains → Add Custom Domain → enter `guardcardcheck.com`

**4.2** Add DNS records at your registrar:

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `your-app.railway.app` |
| A | `@` | *(IP shown in Railway dashboard)* |

If using **Cloudflare** (recommended — free DDoS protection):

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| CNAME | `www` | `your-app.railway.app` | ✅ Proxied |
| CNAME | `@` | `your-app.railway.app` | ✅ Proxied |

**4.3 SSL** — Railway auto-provisions Let's Encrypt once DNS propagates (5-30 min). Nothing to configure.

---

### Step 5 — End-to-End Test

Run through this before announcing:

**Auth:**
- [ ] `/register` → create account → lands on `/dashboard`
- [ ] `/login` → signs in → lands on `/dashboard`
- [ ] Dashboard shows real org name and plan

**Verify:**
- [ ] `/verify` → search a real CA license (try `G123456`) → result appears
- [ ] Free tier: after 1 search shows "upgrade" prompt

**Stripe:**
- [ ] `/pricing` → click "Start Business" → Stripe Checkout opens
- [ ] Pay with test card `4242 4242 4242 4242` / any future date / any CVV
- [ ] Redirects to `/checkout/success`
- [ ] Dashboard now shows "Business Plan"
- [ ] Dashboard → Settings → Billing → "Manage Billing" → opens Stripe Customer Portal

**Webhooks:**
- [ ] Stripe Dashboard → webhook endpoint shows recent successful events
- [ ] User plan in DB matches what Stripe shows

---

## DCA API Integration (California)

The California adapter is fully wired in `services/states/california.js`. The moment you set `DCA_API_KEY` in your env, it activates.

**To get approved:** Apply at [data.ca.gov/developer](https://data.ca.gov/developer). Mention "License verification for Private Patrol Operators under BSIS." Typical approval: 2-4 weeks.

**Until approved:** All 9 other states (FL, TX, IL, VA, NV, OR, WA, AZ, NC) are fully live using portal scraping. CA returns `VERIFICATION_ERROR` with a clear message.

**After approval:** Run the diagnostic in `services/states/DCA_INTEGRATION_NOTES.js` to confirm the exact endpoint paths and response field names (one-time, ~30-60 min calibration).

---

## API Reference

### Auth
```
POST /api/auth/register   { email, password, firstName, lastName, organizationName }
POST /api/auth/login      { email, password }
GET  /api/auth/me         → user + plan + usage (JWT required)
POST /api/auth/logout
```

### Verification
```
GET  /api/states                        → all 10 states + metadata
POST /api/verify                        { stateCode, licenseNumber }
GET  /api/search?firstName=X&lastName=Y&states=CA,FL
POST /api/verify/batch                  { roster: [{stateCode, licenseNumber, guardName}] }
POST /api/verify/event-pack             { roster } + X-Event-Pack-Token header
```

### Billing
```
GET  /api/billing/plans
POST /api/billing/checkout/:planId      { billing: 'monthly'|'annual' }
POST /api/billing/event-pack            { eventName }
GET  /api/billing/portal
GET  /api/billing/subscription
GET  /api/billing/invoices
GET  /api/billing/usage
POST /api/billing/webhook               (Stripe — raw body)
```

---

## Plan Limits

| Plan | Price | Searches/mo | Roster | Features |
|------|-------|-------------|--------|---------|
| Free | $0 | 1/day | — | License lookup only |
| Starter | $29/mo | 25 | — | + Name search, alerts |
| Business | $79/mo | 200 | 200 guards | + Roster upload, export |
| Enterprise | $199/mo | Unlimited | 5,000 guards | + API keys, dedicated support |
| Event Pack | $49 one-time | — | 500 guards | No subscription needed |

Annual billing = 2 months free.

---

## Costs to Run

| Service | Cost |
|---------|------|
| Railway Hobby | $5/mo |
| Railway PostgreSQL | $5/mo |
| Cloudflare (free tier) | $0 |
| Domain | ~$1/mo |
| **Total** | **~$11/mo** |

Stripe: 2.9% + $0.30 per transaction (no monthly fee).

---

## Troubleshooting

**Webhook 400 "Invalid signature"** → The webhook route must get a raw Buffer body. Check that `express.raw()` middleware is applied before `express.json()` — this is handled correctly in `server.js` by mounting the webhook route before the JSON middleware.

**Plan not updating after payment** → Check Stripe webhook logs for failed deliveries. Use "Resend" in Stripe Dashboard to replay failed events.

**State portal returning errors** → State portals occasionally change their HTML structure. Update the cheerio selectors in the relevant state adapter file.

**"DATABASE_URL not set"** → Railway auto-sets this from the PostgreSQL plugin. Make sure the DB plugin is added to your project.

**CA returning VERIFICATION_ERROR** → `DCA_API_KEY` is not set. This is expected until your DCA developer application is approved.

---

*GuardCardCheck.com · Node.js 18+ · PostgreSQL 15+ · Stripe API 2024-12 · 10 States*
