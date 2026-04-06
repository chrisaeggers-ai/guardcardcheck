import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type GrowthAccountRow = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  plan: string;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  monthlySearches: number;
  lastSearchAt: string | null;
};

export type GrowthKpis = {
  signups7d: number;
  signups30d: number;
  payingAccounts: number;
  totalAccounts: number;
  monthlySearchesSum: number;
  activeLast7d: number;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function currentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function listAllAuthUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const batch = data.users;
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }
  return users;
}

type ProfileRow = {
  id: string;
  plan: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  phone: string | null;
};

async function fetchProfilesMap(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  for (const group of chunk(ids, 100)) {
    if (!group.length) continue;
    const { data, error } = await admin.from('profiles').select('*').in('id', group);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      map.set(row.id as string, row as ProfileRow);
    }
  }
  return map;
}

type UsageRow = {
  user_id: string;
  monthly_searches: number | null;
  last_search_at: string | null;
};

async function fetchUsageMap(
  admin: SupabaseClient,
  ids: string[],
  monthYear: string
): Promise<Map<string, UsageRow>> {
  const map = new Map<string, UsageRow>();
  for (const group of chunk(ids, 100)) {
    if (!group.length) continue;
    const { data, error } = await admin
      .from('usage_stats')
      .select('user_id, monthly_searches, last_search_at')
      .eq('month_year', monthYear)
      .in('user_id', group);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      map.set((row as UsageRow).user_id, row as UsageRow);
    }
  }
  return map;
}

function isPaying(p: ProfileRow | undefined): boolean {
  if (!p) return false;
  const st = (p.subscription_status || '').toLowerCase();
  if (st === 'active' || st === 'trialing') return true;
  const plan = (p.plan || 'free').toLowerCase();
  return plan !== 'free';
}

export async function loadGrowthDashboardData(): Promise<{
  rows: GrowthAccountRow[];
  kpis: GrowthKpis;
  monthYear: string;
}> {
  const admin = createAdminClient();
  const users = await listAllAuthUsers(admin);
  const ids = users.map((u) => u.id);
  const profilesMap = await fetchProfilesMap(admin, ids);
  const monthYear = currentMonthYear();
  const usageMap = await fetchUsageMap(admin, ids, monthYear);

  const now = Date.now();
  const d7 = now - 7 * 24 * 60 * 60 * 1000;
  const d30 = now - 30 * 24 * 60 * 60 * 1000;

  let signups7d = 0;
  let signups30d = 0;
  let payingAccounts = 0;
  let monthlySearchesSum = 0;
  let activeLast7d = 0;

  const rows: GrowthAccountRow[] = [];

  for (const u of users) {
    const created = u.created_at ? new Date(u.created_at).getTime() : 0;
    if (created >= d7) signups7d += 1;
    if (created >= d30) signups30d += 1;

    const lastIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
    if (lastIn >= d7) activeLast7d += 1;

    const p = profilesMap.get(u.id);
    if (isPaying(p)) payingAccounts += 1;

    const meta = u.user_metadata as Record<string, unknown> | undefined;
    const fullName =
      typeof meta?.full_name === 'string'
        ? meta.full_name
        : typeof meta?.fullName === 'string'
          ? meta.fullName
          : '';

    const usage = usageMap.get(u.id);
    const ms = usage?.monthly_searches ?? 0;
    monthlySearchesSum += ms;

    rows.push({
      id: u.id,
      email: u.email || '',
      fullName,
      phone: p?.phone ?? null,
      createdAt: u.created_at || '',
      lastSignInAt: u.last_sign_in_at || null,
      plan: p?.plan || 'free',
      subscriptionStatus: p?.subscription_status ?? null,
      stripeCustomerId: p?.stripe_customer_id ?? null,
      monthlySearches: ms,
      lastSearchAt: usage?.last_search_at ?? null,
    });
  }

  rows.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  const kpis: GrowthKpis = {
    signups7d,
    signups30d,
    payingAccounts,
    totalAccounts: users.length,
    monthlySearchesSum,
    activeLast7d,
  };

  return { rows, kpis, monthYear };
}
