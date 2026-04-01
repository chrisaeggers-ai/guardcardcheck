import Link from 'next/link';
import type { Metadata } from 'next';
import { HomeAuthActions } from '@/app/home-auth-actions';
import { HomeQuickVerify } from '@/app/home-quick-verify';

export const metadata: Metadata = {
  title: 'GuardCardCheck — Guard license verification',
  description:
    'Verify guard cards and firearm permits in real time for California, Florida, and Texas. BSIS and FDACS checks, roster uploads, and compliance alerts for PPOs.',
};

const NAVY = '#0B1F3A';
const BLUE = '#1A56DB';
const GREEN = '#059669';

const navLinkClass =
  'text-sm font-medium text-slate-600 transition hover:text-[#0B1F3A]';

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header
        className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md"
        style={{ boxShadow: `0 1px 0 0 rgba(11, 31, 58, 0.06)` }}
      >
        <nav className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="text-lg font-semibold tracking-tight text-[#0B1F3A]">
              GuardCardCheck.com
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
              <a href="#how" className={navLinkClass}>
                How It Works
              </a>
              <a href="#features" className={navLinkClass}>
                Features
              </a>
              <a href="#pricing" className={navLinkClass}>
                Pricing
              </a>
              <HomeAuthActions navLinkClass={navLinkClass} />
            </div>
          </div>
        </nav>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-gray-50 to-blue-50 px-4 pb-20 pt-16 sm:px-6 lg:px-8">
        <div
          className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: `radial-gradient(circle, ${BLUE}40, transparent 70%)` }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <p
            className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm"
            style={{ backgroundColor: NAVY }}
          >
            10-State Guard License Verification
          </p>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#0B1F3A] sm:text-5xl lg:text-[3.25rem] lg:leading-tight">
            Verify Guard Cards &amp; Firearm Permits Instantly
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Real-time checks against official registries so you know every officer on your roster is licensed,
            armed where allowed, and current — before you assign a post.
          </p>

          <HomeQuickVerify />
        </div>
      </section>

      <section className="py-5" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 sm:grid-cols-4 sm:px-6 lg:px-8">
          {[
            'Real-time BSIS checks',
            'Guard Cards & Firearm Permits',
            'Daily automated monitoring',
            'Trusted by PPOs',
          ].map((label) => (
            <div key={label} className="text-center">
              <p className="text-sm font-semibold text-white">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold text-[#0B1F3A]">How It Works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            From roster to report in four steps — built for contract security and in-house compliance teams.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '1',
                title: 'Upload Roster',
                body: 'CSV or spreadsheet — we map columns to state license formats.',
              },
              {
                step: '2',
                title: 'We Check Every License',
                body: 'Automated pulls from BSIS and partner state portals where available.',
              },
              {
                step: '3',
                title: 'Get Instant Alerts',
                body: 'Email when status changes, expires, or a guard falls out of compliance.',
              },
              {
                step: '4',
                title: 'Export Reports',
                body: 'Audit-ready PDF and CSV for clients and internal QA.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: BLUE }}
                >
                  {card.step}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-[#0B1F3A]">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-[#0B1F3A]">Features</h2>
          <p className="mt-2 max-w-xl text-slate-600">
            Everything you need to stay ahead of expirations and prove diligence to your customers.
          </p>
          <div className="mt-12 grid items-start gap-12 lg:grid-cols-2">
            <ul className="space-y-4">
              {[
                'Bulk upload — verify dozens or hundreds of licenses in one job.',
                'Daily 2AM checks — catch overnight status changes before your shift.',
                'Email alerts — route to ops, HR, or site supervisors.',
                'Multiple users — roles for admins, viewers, and billing.',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span
                    className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: GREEN }}
                  >
                    ✓
                  </span>
                  <span className="text-slate-700">{item}</span>
                </li>
              ))}
            </ul>
            <div
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
              style={{ boxShadow: `0 25px 50px -12px rgba(11, 31, 58, 0.15)` }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <span className="text-sm font-semibold text-[#0B1F3A]">Compliance dashboard</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Live
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 border-b border-slate-100 p-4">
                {[
                  { label: 'Active', value: '842', color: GREEN },
                  { label: 'Expiring', value: '23', color: '#D97706' },
                  { label: 'Issues', value: '4', color: '#DC2626' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold" style={{ color: stat.color }}>
                      {stat.value}
                    </p>
                    <p className="text-xs text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Recent roster check</p>
                <div className="mt-3 space-y-2">
                  {[
                    { name: 'J. Martinez', lic: 'G1441140', st: 'Active' },
                    { name: 'A. Chen', lic: 'G9988776', st: 'Active' },
                    { name: 'R. Okonkwo', lic: 'G2233445', st: 'Expiring' },
                  ].map((row) => (
                    <div
                      key={row.lic}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">{row.name}</span>
                      <span className="text-slate-500">{row.lic}</span>
                      <span
                        className={`text-xs font-semibold ${
                          row.st === 'Active' ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        {row.st}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold text-[#0B1F3A]">Pricing</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Simple tiers — upgrade as your roster grows. See full details on the pricing page.
          </p>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              {
                name: 'Starter',
                price: '$29',
                desc: 'Small teams getting started with roster checks.',
                featured: false,
              },
              {
                name: 'Business',
                price: '$79',
                desc: 'Daily monitoring, alerts, and exports for growing PPOs.',
                featured: true,
              },
              {
                name: 'Enterprise',
                price: '$199',
                desc: 'Volume, SSO, and dedicated support for large programs.',
                featured: false,
              },
            ].map((tier) => (
              <Link
                key={tier.name}
                href="/pricing"
                className={`relative flex flex-col rounded-2xl border p-8 transition hover:shadow-lg ${
                  tier.featured
                    ? 'border-[#1A56DB] bg-blue-50/50 shadow-md ring-2 ring-[#1A56DB]/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                {tier.featured ? (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: BLUE }}
                  >
                    Most popular
                  </span>
                ) : null}
                <h3 className="text-lg font-semibold text-[#0B1F3A]">{tier.name}</h3>
                <p className="mt-4 text-4xl font-bold text-[#0B1F3A]">{tier.price}</p>
                <p className="mt-2 flex-1 text-sm text-slate-600">{tier.desc}</p>
                <span className="mt-6 text-sm font-semibold" style={{ color: BLUE }}>
                  View plans →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div
          className="mx-auto max-w-5xl overflow-hidden rounded-3xl px-8 py-16 text-center text-white sm:px-12"
          style={{
            background: `linear-gradient(135deg, ${NAVY} 0%, #132f52 50%, #0d2744 100%)`,
          }}
        >
          <h2 className="text-3xl font-bold sm:text-4xl">Stop Risking It</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
            Unlicensed guards are a liability. Put verification on autopilot and sleep better before every shift.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex rounded-xl px-8 py-3.5 text-sm font-semibold text-[#0B1F3A] shadow-lg transition hover:opacity-95"
              style={{ backgroundColor: '#fff' }}
            >
              Start Free Trial
            </Link>
            <Link
              href="/verify"
              className="inline-flex rounded-xl border border-white/30 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Try a verification
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} GuardCardCheck.com. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <Link href="/verify" className="text-slate-600 hover:text-[#1A56DB]">
              Verify
            </Link>
            <Link href="/pricing" className="text-slate-600 hover:text-[#1A56DB]">
              Pricing
            </Link>
            <Link href="/login" className="text-slate-600 hover:text-[#1A56DB]">
              Log in
            </Link>
            <a href="#how" className="text-slate-600 hover:text-[#1A56DB]">
              How it works
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
