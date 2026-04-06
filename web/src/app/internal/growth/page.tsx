import Link from 'next/link';
import { loadGrowthDashboardData } from '@/lib/internal-growth-data';

const PAGE_SIZE = 25;

export default async function InternalGrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);

  const { rows, kpis, monthYear } = await loadGrowthDashboardData();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-white">Growth &amp; sales</h1>
        <p className="mt-1 text-sm text-slate-400">
          Account overview, usage ({monthYear}), and links to verification history. Staff only.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="New signups (7d)" value={kpis.signups7d} />
        <KpiCard label="New signups (30d)" value={kpis.signups30d} />
        <KpiCard label="Paying accounts" value={kpis.payingAccounts} sub={`of ${kpis.totalAccounts} total`} />
        <KpiCard label="Searches this month" value={kpis.monthlySearchesSum} sub={`all accounts · ${monthYear}`} />
        <KpiCard label="Signed in (7d)" value={kpis.activeLast7d} sub="Proxy: last auth sign-in" />
        <KpiCard label="Total accounts" value={kpis.totalAccounts} />
      </section>

      <section className="overflow-hidden rounded-xl border border-white/10 bg-slate-800/30">
        <div className="border-b border-white/10 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Accounts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">History</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
                <th className="px-4 py-3 font-medium text-right">Searches / mo</th>
                <th className="px-4 py-3 font-medium">Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pageRows.map((r) => (
                <tr key={r.id} className="text-slate-200 hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/internal/growth/user/${r.id}`}
                      className="text-xs font-medium text-amber-200/90 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-xs text-slate-300">
                    {r.email || '—'}
                  </td>
                  <td className="max-w-[140px] truncate px-4 py-2.5">{r.fullName || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{r.phone || '—'}</td>
                  <td className="px-4 py-2.5 capitalize">{r.plan}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-400">
                    {r.subscriptionStatus || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
                    {r.lastSignInAt ? new Date(r.lastSignInAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.monthlySearches.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    {r.stripeCustomerId ? (
                      <a
                        href={`https://dashboard.stripe.com/customers/${r.stripeCustomerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-slate-400 sm:px-6">
            <span>
              Page {safePage} of {totalPages} ({rows.length} accounts)
            </span>
            <div className="flex gap-2">
              {safePage > 1 ? (
                <Link
                  href={safePage === 2 ? '/internal/growth' : `/internal/growth?page=${safePage - 1}`}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-slate-200 transition hover:border-[#1A56DB]/50 hover:bg-white/10"
                >
                  Previous
                </Link>
              ) : null}
              {safePage < totalPages ? (
                <Link
                  href={`/internal/growth?page=${safePage + 1}`}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-slate-200 transition hover:border-[#1A56DB]/50 hover:bg-white/10"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-800/50 p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{value.toLocaleString()}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}
