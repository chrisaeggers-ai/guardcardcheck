'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const NAVY = '#0B1F3A';
const BLUE = '#1A56DB';
const GREEN = '#059669';

type BillingPeriod = 'monthly' | 'annual';

type PlanFromApi = {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  annualSavings: number | null;
  popular: boolean;
  cta: string;
};

type AddonFromApi = {
  id: string;
  name: string;
  description: string;
  price: number;
  notes?: string[];
};

/** Marketing copy aligned with product positioning */
const FEATURES: Record<string, string[]> = {
  free: ['1 search/day', '10 states', 'No roster', 'No API'],
  starter: ['25 searches/month', '25 guard roster', 'Name search', 'Email alerts', '2 users'],
  business: ['200 searches/month', '200 guard roster', 'Batch verify', 'CSV export', '10 users'],
  enterprise: [
    'Unlimited searches',
    '5000 guard roster',
    'API access',
    'Dedicated support',
    'Unlimited users',
  ],
};

const PLAN_ORDER = ['free', 'starter', 'business', 'enterprise'] as const;

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function CheckIcon() {
  return (
    <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#059669]" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function PricingPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [plans, setPlans] = useState<PlanFromApi[]>([]);
  const [addons, setAddons] = useState<AddonFromApi[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [eventPackLoading, setEventPackLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/billing/plans');
        if (!res.ok) throw new Error('Failed to load plans');
        const data = await res.json();
        if (cancelled) return;
        const ordered = [...(data.plans as PlanFromApi[])].sort(
          (a, b) => PLAN_ORDER.indexOf(a.id as (typeof PLAN_ORDER)[number]) - PLAN_ORDER.indexOf(b.id as (typeof PLAN_ORDER)[number])
        );
        setPlans(ordered);
        setAddons(data.addons || []);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError('We could not load pricing. Please refresh or try again later.');
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startCheckout = useCallback(
    async (planId: string) => {
      setCheckoutPlanId(planId);
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, billing }),
        });
        if (res.status === 401) {
          router.push(`/login?redirect=${encodeURIComponent('/pricing')}`);
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Checkout failed');
        }
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl as string;
          return;
        }
        throw new Error('No checkout URL returned');
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Checkout could not be started.');
      } finally {
        setCheckoutPlanId(null);
      }
    },
    [billing, router]
  );

  const startEventPack = useCallback(async () => {
    setEventPackLoading(true);
    try {
      const res = await fetch('/api/billing/event-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent('/pricing')}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start checkout');
      if (data.checkoutUrl) window.location.href = data.checkoutUrl as string;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Event Pack checkout failed.');
    } finally {
      setEventPackLoading(false);
    }
  }, [router]);

  const eventPack = addons.find((a) => a.id === 'event_pack');

  return (
    <main className="min-h-screen px-4 pb-20 pt-12 sm:px-6 lg:px-8" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-slate-400">GuardCardCheck</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Simple pricing for license verification</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">
            Choose a plan that fits your PPO or security team. Upgrade or downgrade anytime from your dashboard.
          </p>
        </header>

        <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <span className="text-sm font-medium text-slate-300">Billing period</span>
          <div
            className="inline-flex rounded-full border border-slate-600/80 bg-[#0a1a32] p-1"
            role="group"
            aria-label="Monthly or annual billing"
          >
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                billing === 'monthly' ? 'text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              style={billing === 'monthly' ? { backgroundColor: BLUE } : undefined}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling('annual')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                billing === 'annual' ? 'text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              style={billing === 'annual' ? { backgroundColor: BLUE } : undefined}
            >
              Annual
            </button>
          </div>
          {billing === 'annual' && (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: GREEN }}
            >
              Save with yearly billing
            </span>
          )}
        </div>

        {loadError && (
          <div className="mb-8 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-100">
            {loadError}
          </div>
        )}

        {loadingPlans ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl border border-slate-700/50 bg-slate-800/40" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
            {plans.map((plan) => {
              const features = FEATURES[plan.id] || [];
              const isFree = plan.id === 'free';
              const isFeatured = plan.popular;
              const monthlyDisplay = plan.monthlyPrice;
              const annualPerMonth = plan.annualPrice > 0 ? Math.round((plan.annualPrice / 12) * 100) / 100 : 0;
              const showAnnualSavings = billing === 'annual' && plan.annualSavings != null && plan.annualSavings > 0;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-6 shadow-lg transition ${
                    isFeatured
                      ? 'border-[#1A56DB] bg-[#0d2744] ring-2 ring-[#1A56DB]/40 lg:scale-[1.02]'
                      : 'border-slate-600/50 bg-[#0a1a32]/80'
                  }`}
                >
                  {isFeatured && (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow"
                      style={{ backgroundColor: BLUE }}
                    >
                      Most Popular
                    </div>
                  )}

                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
                  </div>

                  <div className="mb-6">
                    {isFree ? (
                      <p className="text-3xl font-bold text-white">
                        {formatMoney(0)}
                        <span className="text-base font-normal text-slate-400">/mo</span>
                      </p>
                    ) : billing === 'monthly' ? (
                      <p className="text-3xl font-bold text-white">
                        {formatMoney(monthlyDisplay)}
                        <span className="text-base font-normal text-slate-400">/mo</span>
                      </p>
                    ) : (
                      <div>
                        <p className="text-3xl font-bold text-white">
                          {formatMoney(annualPerMonth)}
                          <span className="text-base font-normal text-slate-400">/mo</span>
                        </p>
                        <p className="mt-1 text-sm text-slate-400">billed {formatMoney(plan.annualPrice)} yearly</p>
                        {showAnnualSavings && (
                          <span
                            className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                            style={{ backgroundColor: GREEN }}
                          >
                            Save {formatMoney(plan.annualSavings!)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <ul className="mb-8 flex flex-1 flex-col gap-3 text-sm text-slate-200">
                    {features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <CheckIcon />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {isFree ? (
                    <Link
                      href="/register"
                      className="mt-auto block w-full rounded-xl py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
                      style={{ backgroundColor: BLUE }}
                    >
                      {plan.cta}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={checkoutPlanId === plan.id}
                      onClick={() => startCheckout(plan.id)}
                      className="mt-auto w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                      style={{ backgroundColor: isFeatured ? GREEN : BLUE }}
                    >
                      {checkoutPlanId === plan.id ? 'Redirecting…' : plan.cta}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Event Pack */}
        <section className="mt-16 rounded-2xl border border-slate-600/50 bg-[#0a1a32]/90 p-8 shadow-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">{eventPack?.name ?? 'Event Pack'}</h3>
              <p className="mt-1 max-w-xl text-sm text-slate-300">
                {eventPack?.description ??
                  'One-time verification of a custom guard list for a specific event — no subscription required.'}
              </p>
              <p className="mt-3 text-2xl font-bold text-white">
                {formatMoney(eventPack?.price ?? 49)}
                <span className="text-base font-normal text-slate-400"> one-time</span>
              </p>
            </div>
            <button
              type="button"
              disabled={eventPackLoading}
              onClick={startEventPack}
              className="shrink-0 rounded-xl border-2 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-60"
              style={{ borderColor: BLUE, color: '#fff' }}
            >
              {eventPackLoading ? 'Redirecting…' : 'Buy Event Pack'}
            </button>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-20 border-t border-slate-700/60 pt-16">
          <h2 className="mb-10 text-center text-2xl font-bold text-white">Billing FAQ</h2>
          <div className="mx-auto max-w-3xl space-y-6">
            <FaqItem
              q="Is there a free trial?"
              a="The Free plan lets you run limited verifications each day so you can evaluate GuardCardCheck before upgrading. Paid plans start billing as soon as you complete checkout."
            />
            <FaqItem
              q="Can I switch between monthly and annual billing?"
              a="Yes. Annual plans include savings versus paying monthly. You can manage billing intervals and payment methods from the Stripe customer portal linked from your dashboard when available."
            />
            <FaqItem
              q="What payment methods do you accept?"
              a="Payments are processed securely by Stripe. Major cards and other methods enabled in your region appear at checkout."
            />
            <FaqItem
              q="How do I cancel or change my plan?"
              a="You can cancel or downgrade from your account billing settings. Access continues through the end of your current billing period for subscriptions."
            />
            <FaqItem
              q="What is the Event Pack?"
              a="Event Pack is a one-time purchase for verifying a guard list for a single event, without a monthly subscription. It is ideal for conferences, venues, or short-term deployments."
            />
            <FaqItem
              q="Do I need an account to subscribe?"
              a="Paid checkout requires a GuardCardCheck account so we can attach your subscription to your organization. Create an account first, then choose a plan on this page."
            />
          </div>
        </section>

        <p className="mt-12 text-center text-sm text-slate-500">
          <Link href="/" className="text-slate-400 hover:text-white">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-slate-600/40 bg-[#0a1a32]/50 px-5 py-4">
      <h3 className="font-semibold text-white">{q}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{a}</p>
    </div>
  );
}
