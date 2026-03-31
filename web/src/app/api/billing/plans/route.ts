import { NextResponse } from 'next/server';

interface PlanDef {
  id: string; name: string; tagline: string;
  monthlyPrice: number; annualPrice: number; annualSavings?: number;
  limits: Record<string, unknown>; popular: boolean; cta: string;
}
interface AddonDef {
  id: string; name: string; description: string; price: number; notes: string[];
}

export async function GET() {
  const { PLANS, ADDONS } = require('@/lib/config/plans');

  const plans = (Object.values(PLANS) as PlanDef[]).map((p) => ({
    id: p.id, name: p.name, tagline: p.tagline,
    monthlyPrice: p.monthlyPrice, annualPrice: p.annualPrice,
    annualSavings: p.annualSavings || null,
    limits: p.limits, popular: p.popular, cta: p.cta,
  }));

  const addons = (Object.values(ADDONS) as AddonDef[]).map((a) => ({
    id: a.id, name: a.name, description: a.description, price: a.price, notes: a.notes,
  }));

  return NextResponse.json({ plans, addons });
}
