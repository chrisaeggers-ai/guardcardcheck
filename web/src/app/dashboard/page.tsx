import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInternalAnalystEmail } from '@/lib/internal-access';
import { LogoutButton } from './logout-button';
import { BillingButton } from './billing-button';
import { SearchHistoryPanel } from './search-history-panel';
import { RosterUploadPanel } from './roster-upload-panel';

const { getPlan } = require('@/lib/config/plans') as {
  getPlan: (id: string) => {
    name: string;
    limits: { searchesPerMonth: number | null; maxRosterSize: number };
  };
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const planId = (profile?.plan as string) || 'free';
  const planConfig = getPlan(planId);
  const subscriptionStatus = (profile?.subscription_status as string | null) || null;

  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data: usageRow } = await admin
    .from('usage_stats')
    .select('monthly_searches')
    .eq('user_id', user.id)
    .eq('month_year', monthYear)
    .maybeSingle();

  const searchesUsed = usageRow?.monthly_searches ?? 0;
  const searchLimit = planConfig.limits.searchesPerMonth;
  const searchLabel =
    searchLimit == null
      ? `${searchesUsed.toLocaleString()} (unlimited)`
      : `${searchesUsed.toLocaleString()} / ${searchLimit.toLocaleString()}`;

  const rosterCap = planConfig.limits.maxRosterSize ?? 0;
  const guardsMonitored = 0;

  const planActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const showInternalGrowthLink = isInternalAnalystEmail(user.email);

  return (
    <div className="min-h-screen bg-[#0B1F3A] text-slate-100">
      <header className="border-b border-white/10 bg-[#0B1F3A]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-nowrap items-center gap-2 overflow-x-auto px-6 py-4 [scrollbar-width:thin] sm:gap-3 sm:py-5">
          <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight text-white">
            GuardCardCheck
          </Link>
          <span className="shrink-0 text-slate-500">|</span>
          <span className="max-w-[min(280px,50vw)] shrink truncate text-sm text-slate-300 sm:max-w-md">
            {user.email}
          </span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              planActive
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'bg-slate-600/40 text-slate-300 ring-1 ring-white/10'
            }`}
          >
            {planConfig.name}
          </span>
          {showInternalGrowthLink ? (
            <Link
              href="/internal/growth"
              className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 shadow-sm transition hover:border-amber-300/60 hover:bg-amber-500/20 sm:px-4"
            >
              Growth &amp; sales dashboard
            </Link>
          ) : null}
          <Link
            href="/auth/update-password"
            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-[#1A56DB]/50 hover:bg-white/10 hover:text-white sm:px-4"
          >
            Change password
          </Link>
          <Link
            href="/"
            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-[#1A56DB]/50 hover:bg-white/10 hover:text-white sm:px-4"
          >
            Back to home
          </Link>
          <span className="shrink-0">
            <LogoutButton />
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            License verification and subscription overview for your organization.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current Plan</p>
            <p className="mt-2 text-2xl font-semibold text-white">{planConfig.name}</p>
            {subscriptionStatus ? (
              <p className="mt-1 text-xs capitalize text-slate-400">Status: {subscriptionStatus}</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Searches Used</p>
            <p className="mt-2 text-2xl font-semibold text-white">{searchLabel}</p>
            <p className="mt-1 text-xs text-slate-400">This billing month</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Guards Monitored</p>
            <p className="mt-2 text-2xl font-semibold text-white">{guardsMonitored.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-400">
              Roster capacity: {rosterCap === 0 ? '—' : `up to ${rosterCap.toLocaleString()}`}
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Quick actions</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/verify"
              className="group rounded-xl border border-white/10 bg-slate-800/40 p-5 transition hover:border-[#1A56DB]/50 hover:bg-slate-800/70"
            >
              <p className="font-medium text-white">Verify a License</p>
              <p className="mt-1 text-sm text-slate-400">Run a single license check by state and number.</p>
              <span className="mt-3 inline-block text-sm font-medium text-[#1A56DB] group-hover:underline">
                Go to verify →
              </span>
            </Link>
            <div className="rounded-xl border border-white/10 bg-slate-800/40 p-5">
              <p className="font-medium text-white">Manage Billing</p>
              <p className="mt-1 text-sm text-slate-400">Update payment method, plan, and billing history.</p>
              <div className="mt-4">
                <BillingButton />
              </div>
            </div>
            <Link
              href="/dashboard/invoices"
              className="group rounded-xl border border-white/10 bg-slate-800/40 p-5 transition hover:border-[#1A56DB]/50 hover:bg-slate-800/70"
            >
              <p className="font-medium text-white">View Invoices</p>
              <p className="mt-1 text-sm text-slate-400">Download PDFs and review past charges.</p>
              <span className="mt-3 inline-block text-sm font-medium text-[#1A56DB] group-hover:underline">
                Open invoices →
              </span>
            </Link>
            <Link
              href="#roster-upload"
              className="group rounded-xl border border-white/10 bg-slate-800/40 p-5 transition hover:border-[#1A56DB]/50 hover:bg-slate-800/70"
            >
              <p className="font-medium text-white">Import roster (CSV or Google Sheets)</p>
              <p className="mt-1 text-sm text-slate-400">Bulk-verify licenses including CA, FL, TX, NV (Business+).</p>
              <span className="mt-3 inline-block text-sm font-medium text-[#1A56DB] group-hover:underline">
                Go to upload →
              </span>
            </Link>
          </div>
        </section>

        <RosterUploadPanel
          batchEnabled={planId === 'business' || planId === 'enterprise'}
          maxRows={planId === 'enterprise' ? 5000 : 200}
          monthlySearchLimit={searchLimit}
          searchesUsedThisMonth={searchesUsed}
        />

        <section className="rounded-xl border border-white/10 bg-slate-800/30 p-6 sm:p-8">
          <SearchHistoryPanel />
        </section>
      </main>
    </div>
  );
}
