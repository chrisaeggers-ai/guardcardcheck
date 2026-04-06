import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

const SOURCE_LABEL: Record<string, string> = {
  verify: 'License verify',
  name_search: 'Name search',
  florida: 'Florida',
  texas: 'Texas',
  nevada: 'Nevada',
};

function outcomeClass(outcome: string): string {
  if (outcome === 'success') return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35';
  if (outcome === 'not_found') return 'bg-amber-500/15 text-amber-200 ring-amber-500/35';
  return 'bg-red-500/15 text-red-300 ring-red-500/35';
}

export default async function InternalGrowthUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(id);
  if (authErr || !authData?.user) {
    notFound();
  }
  const u = authData.user;

  const { data: profile } = await admin
    .from('profiles')
    .select('plan, subscription_status, stripe_customer_id, phone')
    .eq('id', id)
    .maybeSingle();

  const { data: history, error: histErr } = await admin
    .from('search_history')
    .select(
      'id, created_at, source, state_code, primary_label, secondary_label, outcome, result_summary, from_cache'
    )
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (histErr) {
    console.error('[internal/growth/user] search_history', histErr.message);
  }

  const meta = u.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof meta?.full_name === 'string'
      ? meta.full_name
      : typeof meta?.fullName === 'string'
        ? meta.fullName
        : '';

  const items = history || [];

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/internal/growth"
            className="text-sm font-medium text-slate-400 transition hover:text-white"
          >
            ← Back to accounts
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-white">Account detail</h1>
          <p className="mt-1 font-mono text-sm text-slate-400">{u.email}</p>
        </div>
        {profile?.stripe_customer_id ? (
          <a
            href={`https://dashboard.stripe.com/customers/${profile.stripe_customer_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-blue-400 transition hover:border-[#1A56DB]/50 hover:bg-white/10"
          >
            Stripe customer
          </a>
        ) : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</p>
          <p className="mt-2 text-slate-200">{fullName || '—'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</p>
          <p className="mt-2 font-mono text-slate-200">{profile?.phone || '—'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan</p>
          <p className="mt-2 capitalize text-slate-200">{profile?.plan || 'free'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Subscription</p>
          <p className="mt-2 capitalize text-slate-200">{profile?.subscription_status || '—'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</p>
          <p className="mt-2 text-slate-400">
            {u.created_at ? new Date(u.created_at).toLocaleString() : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last sign-in</p>
          <p className="mt-2 text-slate-400">
            {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : '—'}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-800/30 p-6 sm:p-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Search &amp; verification history
        </h2>
        <p className="mt-1 text-sm text-slate-500">Last 200 events, newest first.</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#0B1F3A]/95 backdrop-blur">
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Query</th>
                  <th className="px-3 py-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No history yet.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="text-slate-300">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{SOURCE_LABEL[row.source] || row.source}</td>
                      <td className="px-3 py-2 text-xs">{row.state_code || '—'}</td>
                      <td className="max-w-[280px] px-3 py-2">
                        <div className="truncate text-xs" title={row.primary_label}>
                          {row.primary_label}
                          {row.secondary_label ? ` · ${row.secondary_label}` : ''}
                        </div>
                        {row.result_summary ? (
                          <div className="truncate text-xs text-slate-500">{row.result_summary}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs ring-1 ring-inset ${outcomeClass(row.outcome)}`}
                        >
                          {row.outcome}
                        </span>
                        {row.from_cache ? (
                          <span className="ml-1 text-[10px] uppercase text-slate-500">cache</span>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
