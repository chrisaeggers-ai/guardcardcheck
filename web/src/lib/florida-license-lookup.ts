/**
 * Florida FDACS individual license lookup via Puppeteer (server-only).
 * Portal: https://licensing.fdacs.gov/access/individual.aspx
 */

import { load } from 'cheerio';
import type { Browser, Page } from 'puppeteer';
import { blockHeavyAssets } from '@/lib/puppeteer-resource-block';

const SEARCH_URL = 'https://licensing.fdacs.gov/access/individual.aspx';
const ACCESS_BASE = 'https://licensing.fdacs.gov/access/';

const DEFAULT_NAV_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_NAME_DETAILS = 10;
const STAGGER_MS_MIN = 120;
const STAGGER_MS_MAX = 320;

export type FloridaLicenseRecord = {
  name: string | null;
  license_number: string | null;
  license_type: 'D' | 'G' | string;
  status: string | null;
  expiration_date: string | null;
};

export type FloridaLookupSuccess = {
  ok: true;
  cached: boolean;
  results: FloridaLicenseRecord[];
};

export type FloridaLookupErrorCode =
  | 'BAD_REQUEST'
  | 'NO_RESULTS'
  | 'SITE_ERROR'
  | 'LOAD_FAILED'
  | 'TIMEOUT'
  | 'INTERNAL';

export type FloridaLookupFailure = {
  ok: false;
  error: FloridaLookupErrorCode;
  message: string;
};

export type FloridaLookupResult = FloridaLookupSuccess | FloridaLookupFailure;

type CacheEntry = { expiresAt: number; value: FloridaLookupSuccess };

const cache = new Map<string, CacheEntry>();

function cacheTtlMs(): number {
  const raw = process.env.FLORIDA_LICENSE_CACHE_TTL_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 15 * 60 * 1000;
}

function maxNameDetails(): number {
  const raw = process.env.FLORIDA_LICENSE_MAX_NAME_DETAILS;
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
  }
  return DEFAULT_MAX_NAME_DETAILS;
}

function staggerMs(): number {
  return STAGGER_MS_MIN + Math.floor(Math.random() * (STAGGER_MS_MAX - STAGGER_MS_MIN));
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Normalize FL individual license input per FDACS field help (D/G + 7 digits). */
export function normalizeFloridaLicenseInput(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = cleaned.match(/^([A-Z]{1,2})(\d{7})$/);
  if (!m) return raw.trim().toUpperCase();
  const [, prefix, digits] = m;
  if (prefix.length === 1) return `${prefix} ${digits}`;
  return `${prefix}${digits}`;
}

function licenseTypeFromNumber(licenseNumber: string | null): 'D' | 'G' | string {
  const t = (licenseNumber || '').trim().toUpperCase();
  const first = t.charAt(0);
  if (first === 'D' || first === 'G') return first;
  if (t.startsWith('MB')) return 'MB';
  if (t.startsWith('CC')) return 'CC';
  if (t.startsWith('MA')) return 'MA';
  if (first === 'C') return 'C';
  return first || 'UNKNOWN';
}

function parseUsDateToIso(mmddyyyy: string): string | null {
  const s = mmddyyyy.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseDetailHtml(html: string): FloridaLicenseRecord | null {
  const $ = load(html);
  const lic = $('#cphMain_tcDtlLicNum').first().text().trim();
  if (!lic) return null;
  const name =
    $('#cphMain_tcDtlIndName h3').first().text().trim() ||
    $('#cphMain_tcDtlIndName').first().text().trim() ||
    null;
  const status = $('#cphMain_tcDtlStatus').first().text().trim() || null;
  const expRaw = $('#cphMain_tcDtlExpr').first().text().trim();
  const expiration_date = expRaw ? parseUsDateToIso(expRaw) : null;
  return {
    name: name || null,
    license_number: lic || null,
    license_type: licenseTypeFromNumber(lic),
    status,
    expiration_date,
  };
}

function extractListDetailHrefs(html: string): string[] {
  const $ = load(html);
  const hrefs: string[] = [];
  $('#cphMain_Table6 a[href*="STATUS=IND_DETAIL"]').each((_, el) => {
    const h = $(el).attr('href');
    if (h) hrefs.push(h);
  });
  return [...new Set(hrefs)];
}

function isLblError(html: string): boolean {
  return load(html)('.lblError').length > 0;
}

function cacheKey(params: { licenseNumber?: string; firstName?: string; lastName?: string }): string {
  if (params.licenseNumber) {
    return `lic:${normalizeFloridaLicenseInput(params.licenseNumber)}`;
  }
  const f = (params.firstName || '').trim().toLowerCase();
  const l = (params.lastName || '').trim().toLowerCase();
  return `name:${l},${f}`;
}

export function getFloridaLicenseCache(params: {
  licenseNumber?: string;
  firstName?: string;
  lastName?: string;
}): FloridaLookupSuccess | null {
  const ttl = cacheTtlMs();
  if (ttl === 0) return null;
  const key = cacheKey(params);
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(key);
    return null;
  }
  return { ...entry.value, cached: true };
}

export function setFloridaLicenseCache(
  params: { licenseNumber?: string; firstName?: string; lastName?: string },
  value: FloridaLookupSuccess
): void {
  const ttl = cacheTtlMs();
  if (ttl === 0) return;
  const key = cacheKey(params);
  cache.set(key, { expiresAt: Date.now() + ttl, value: { ...value, cached: false } });
}

let browserSingleton: Browser | undefined;

async function getBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer');
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  if (browserSingleton?.connected) return browserSingleton;
  browserSingleton = await puppeteer.default.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
    timeout: 60_000,
  });
  return browserSingleton;
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);
  page.setDefaultTimeout(DEFAULT_NAV_TIMEOUT_MS);
  try {
    await blockHeavyAssets(page);
    await page.setViewport({ width: 1280, height: 800 });
    return await fn(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function gotoSearch(page: Page): Promise<void> {
  await page.goto(SEARCH_URL, {
    waitUntil: 'domcontentloaded',
    timeout: DEFAULT_NAV_TIMEOUT_MS,
  });
  await page.waitForSelector('#cphMain_License', { timeout: DEFAULT_NAV_TIMEOUT_MS });
  await delay(Math.min(staggerMs(), 200));
}

async function submitSearch(page: Page): Promise<void> {
  await delay(staggerMs());
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: DEFAULT_NAV_TIMEOUT_MS }),
    page.click('#Submit'),
  ]);
  await delay(staggerMs());
}

export async function lookupFloridaLicensesPuppeteer(params: {
  licenseNumber?: string;
  firstName?: string;
  lastName?: string;
}): Promise<FloridaLookupResult> {
  const hasLicense = Boolean(params.licenseNumber?.trim());
  const hasName = Boolean(params.firstName?.trim() && params.lastName?.trim());
  if ((hasLicense && hasName) || (!hasLicense && !hasName)) {
    return {
      ok: false,
      error: 'BAD_REQUEST',
      message: 'Provide either licenseNumber, or both firstName and lastName (not both).',
    };
  }

  try {
    return await withPage(async (page) => {
      await gotoSearch(page);

      if (hasLicense) {
        const lic = normalizeFloridaLicenseInput(params.licenseNumber!);
        await page.$eval('#cphMain_License', (el, v) => {
          (el as HTMLInputElement).value = v as string;
        }, lic);
        await page.$eval('#cphMain_Name', (el) => {
          (el as HTMLInputElement).value = '';
        });
      } else {
        const last = params.lastName!.trim();
        const first = params.firstName!.trim();
        const nameField = `${last.toUpperCase()}, ${first.toUpperCase()}`;
        await page.$eval('#cphMain_Name', (el, v) => {
          (el as HTMLInputElement).value = v as string;
        }, nameField);
        await page.$eval('#cphMain_License', (el) => {
          (el as HTMLInputElement).value = '';
        });
      }

      await submitSearch(page);
      let html = await page.content();

      if (isLblError(html)) {
        const msg = load(html)('.lblError').first().text().trim();
        const treatAsNoMatch =
          /no detail information|no\s+records|not\s+found|no\s+match/i.test(msg);
        return {
          ok: false,
          error: treatAsNoMatch ? 'NO_RESULTS' : 'SITE_ERROR',
          message: msg || 'Lookup failed.',
        };
      }

      const detail = parseDetailHtml(html);
      if (detail) {
        return { ok: true, cached: false, results: [detail] };
      }

      const hrefs = extractListDetailHrefs(html);
      if (hrefs.length === 0) {
        return {
          ok: false,
          error: 'NO_RESULTS',
          message: 'No matching licensees found.',
        };
      }

      const limit = maxNameDetails();
      const results: FloridaLicenseRecord[] = [];
      for (let i = 0; i < Math.min(hrefs.length, limit); i++) {
        const absolute = new URL(hrefs[i], ACCESS_BASE).href;
        await delay(staggerMs());
        await page.goto(absolute, {
          waitUntil: 'domcontentloaded',
          timeout: DEFAULT_NAV_TIMEOUT_MS,
        });
        await page
          .waitForSelector('#cphMain_tcDtlLicNum, .lblError', { timeout: DEFAULT_NAV_TIMEOUT_MS })
          .catch(() => undefined);
        await delay(Math.min(staggerMs(), 200));
        html = await page.content();
        if (isLblError(html)) continue;
        const row = parseDetailHtml(html);
        if (row) results.push(row);
      }

      if (results.length === 0) {
        return {
          ok: false,
          error: 'NO_RESULTS',
          message: 'No detailed records could be loaded for the name search.',
        };
      }

      return { ok: true, cached: false, results };
    });
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err?.name === 'TimeoutError' || /timeout/i.test(err?.message || '')) {
      return { ok: false, error: 'TIMEOUT', message: 'FDACS request timed out.' };
    }
    console.error('[florida-license-lookup]', e);
    return {
      ok: false,
      error: 'LOAD_FAILED',
      message: err?.message || 'Failed to load or parse FDACS response.',
    };
  }
}
