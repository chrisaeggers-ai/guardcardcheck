import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';

export default async function InvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single();

  const stripeCustomerId = profile?.stripe_customer_id as string | null;
  let invoices: Array<{
    id: string;
    number: string | null;
    amount: number;
    currency: string;
    status: string | null;
    date: string;
    pdfUrl: string | null;
    hostedUrl: string | null;
  }> = [];

  if (stripeCustomerId) {
    try {
      const stripe = getStripe();
      const list = await stripe.invoices.list({ customer: stripeCustomerId, limit: 24 });
      invoices = list.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        amount: inv.amount_paid / 100,
        currency: inv.currency.toUpperCase(),
        status: inv.status,
        date: new Date(inv.created * 1000).toISOString(),
        pdfUrl: inv.invoice_pdf ?? null,
        hostedUrl: inv.hosted_invoice_url ?? null,
      }));
    } catch {
      invoices = [];
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] text-slate-100">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm text-[#1A56DB] hover:underline">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-white">Invoices</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-slate-800/40 p-6 text-sm text-slate-400">
            {stripeCustomerId
              ? 'No invoices found yet.'
              : 'No billing account yet. Subscribe to a plan to see invoices here.'}
          </p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-800/40">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-white">Invoice {inv.number ?? inv.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(inv.date).toLocaleDateString()} · {inv.status}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-300">
                    {inv.currency} {inv.amount.toFixed(2)}
                  </span>
                  {inv.pdfUrl ? (
                    <a
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1A56DB] hover:underline"
                    >
                      PDF
                    </a>
                  ) : null}
                  {inv.hostedUrl ? (
                    <a
                      href={inv.hostedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1A56DB] hover:underline"
                    >
                      View
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
