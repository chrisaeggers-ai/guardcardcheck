import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStripe } from '@/lib/stripe';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stripeCustomerId = user.stripe_customer_id as string | null;
  if (!stripeCustomerId) return NextResponse.json({ invoices: [] });

  try {
    const stripe = getStripe();
    const list = await stripe.invoices.list({ customer: stripeCustomerId, limit: 12 });
    const invoices = list.data.map(inv => ({
      id: inv.id, number: inv.number, amount: inv.amount_paid / 100,
      currency: inv.currency.toUpperCase(), status: inv.status,
      date: new Date(inv.created * 1000).toISOString(),
      pdfUrl: inv.invoice_pdf, hostedUrl: inv.hosted_invoice_url,
    }));
    return NextResponse.json({ invoices });
  } catch (error) {
    console.error('[Billing] Invoice fetch error:', error);
    return NextResponse.json({ error: 'Failed to load invoices.' }, { status: 500 });
  }
}
