/**
 * Texas TOPS Private Security license lookup via Puppeteer (server-only).
 * Portal: https://tops.portal.texas.gov/psp-self-service/search/index
 *
 * The search form is protected by reCAPTCHA, so Puppeteer launches in
 * HEADFUL mode. When CAPTCHA is detected the scraper pauses and waits
 * for the user to solve it in the visible browser window.
 *
 * Individual detail pages (/search/result/:id?type=person) are public
 * and do NOT require CAPTCHA, so once we have a result URL we can
 * scrape it headlessly.
 */

import type { Browser, Page } from 'puppeteer';
import { blockHeavyAssets } from '@/lib/puppeteer-resource-block';

// ── URLs ──

const SEARCH_URL =
  'https://tops.portal.texas.gov/psp-self-service/search/index';
const RESULT_BASE =
  'https://tops.portal.texas.gov/psp-self-service/search/result';

// ── Timing ──

const NAV_TIMEOUT_MS = 45_000;
const CAPTCHA_WAIT_MS = 120_000;
const CAPTCHA_POLL_INTERVAL = 2_000;
const STAGGER_MIN = 120;
const STAGGER_MAX = 380;
const MAX_RESULTS = 20;
const MAX_PAGES = 5;

// ── Types ──

export type TexasLicenseRecord = {
  name: string;
  license_type: string;
  section: string;
  issued_on: string | null;
  expiration_date: string | null;
  status: string | null;
  /** Physical / mailing ZIP when detected on the TOPS detail page */
  zip_code?: string | null;
};

export type TexasLookupSuccess = {
  ok: true;
  cached: boolean;
  results: TexasLicenseRecord[];
};

export type TexasLookupErrorCode =
  | 'BAD_REQUEST'
  | 'NO_RESULTS'
  | 'CAPTCHA_UNSOLVED'
  | 'SITE_ERROR'
  | 'LOAD_FAILED'
  | 'TIMEOUT'
  | 'INTERNAL';

export type TexasLookupFailure = {
  ok: false;
  error: TexasLookupErrorCode;
  message: string;
};

export type TexasLookupResult = TexasLookupSuccess | TexasLookupFailure;

type CacheEntry = { expiresAt: number; value: TexasLookupSuccess };

// ── In-memory cache ──

const cache = new Map<string, CacheEntry>();

function cacheTtlMs(): number {
  const raw = process.env.TEXAS_LICENSE_CACHE_TTL_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 15 * 60 * 1000;
}

function cacheKey(query: string): string {
  return `tx:${query.trim().toLowerCase()}`;
}

export function getTexasLicenseCache(query: string): TexasLookupSuccess | null {
  const ttl = cacheTtlMs();
  if (ttl === 0) return null;
  const key = cacheKey(query);
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) cache.delete(key);
    return null;
  }
  return { ...entry.value, cached: true };
}

export function setTexasLicenseCache(
  query: string,
  value: TexasLookupSuccess
): void {
  const ttl = cacheTtlMs();
  if (ttl === 0) return;
  cache.set(cacheKey(query), {
    expiresAt: Date.now() + ttl,
    value: { ...value, cached: false },
  });
}

// ── Helpers ──

function staggerMs(): number {
  return STAGGER_MIN + Math.floor(Math.random() * (STAGGER_MAX - STAGGER_MIN));
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(step: string, detail?: string): void {
  const ts = new Date().toISOString();
  console.log(`[texas-lookup ${ts}] ${step}${detail ? ': ' + detail : ''}`);
}

// ── Browser management ──

let browserSingleton: Browser | undefined;

async function getBrowser(headless: boolean): Promise<Browser> {
  const puppeteer = await import('puppeteer');
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  if (browserSingleton?.connected) {
    return browserSingleton;
  }

  log('browser', `launching (headless=${headless})`);
  browserSingleton = await puppeteer.default.launch({
    headless,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
    ],
    timeout: 60_000,
  });
  return browserSingleton;
}

async function withPage<T>(
  headless: boolean,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  const browser = await getBrowser(headless);
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  try {
    await blockHeavyAssets(page);
    await page.setViewport({ width: 1280, height: 900 });
    return await fn(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}

// ── CAPTCHA detection & waiting ──

async function waitForCaptchaSolved(page: Page): Promise<boolean> {
  log('captcha', 'reCAPTCHA detected — waiting for manual solve');
  console.log(
    '\n╔══════════════════════════════════════════════════════╗\n' +
      '║  Please solve CAPTCHA manually in browser window.   ║\n' +
      '╚══════════════════════════════════════════════════════╝\n'
  );

  const deadline = Date.now() + CAPTCHA_WAIT_MS;
  while (Date.now() < deadline) {
    const solved = await page.evaluate(() => {
      const resp = (
        document.querySelector(
          'textarea[name="g-recaptcha-response"]'
        ) as HTMLTextAreaElement | null
      )?.value;
      return Boolean(resp && resp.length > 20);
    });
    if (solved) {
      log('captcha', 'solved');
      return true;
    }
    await delay(CAPTCHA_POLL_INTERVAL);
  }
  log('captcha', 'timed out waiting for solve');
  return false;
}

async function hasCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return Boolean(
      document.querySelector(
        'iframe[src*="recaptcha"], .g-recaptcha, [data-sitekey]'
      )
    );
  });
}

// ── Search flow ──

async function performSearch(
  page: Page,
  query: string,
  filter: 'individual' | 'business' | 'training'
): Promise<void> {
  log('navigate', SEARCH_URL);
  await page.goto(SEARCH_URL, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });
  await delay(Math.min(staggerMs(), 200));

  log('filter', filter);
  const filterMap = {
    individual: '#indSearch',
    business: '#bizSearch',
    training: '#tsSearch',
  };
  const checkbox = await page.$(filterMap[filter]);
  if (checkbox) {
    await checkbox.click();
    await delay(300);
  }

  log('fill', `q="${query}"`);
  await page.waitForSelector('#q', { timeout: 10_000 });
  await page.click('#q', { clickCount: 3 });
  await page.type('#q', query, { delay: 40 });
  await delay(staggerMs());

  if (await hasCaptcha(page)) {
    const solved = await waitForCaptchaSolved(page);
    if (!solved) {
      throw new CaptchaTimeoutError();
    }
  }

  log('submit', 'clicking Search');
  await Promise.all([
    page.waitForNavigation({
      waitUntil: 'networkidle2',
      timeout: NAV_TIMEOUT_MS,
    }),
    page.click('#Search'),
  ]);
  await delay(staggerMs());
  log('submit', `results page loaded — ${page.url()}`);
}

class CaptchaTimeoutError extends Error {
  constructor() {
    super('CAPTCHA was not solved in time.');
    this.name = 'CaptchaTimeoutError';
  }
}

// ── Result list scraping ──

interface SearchResultLink {
  name: string;
  url: string;
  type: 'person' | 'business';
}

async function scrapeResultLinks(
  page: Page,
  maxPages: number
): Promise<SearchResultLink[]> {
  const all: SearchResultLink[] = [];
  let pageNum = 1;

  while (pageNum <= maxPages) {
    log('results-page', `scraping page ${pageNum}`);

    const links = await page.evaluate(() => {
      const items: { name: string; url: string; type: 'person' | 'business' }[] = [];
      document.querySelectorAll('a.search-results').forEach((a) => {
        const href = (a as HTMLAnchorElement).href || '';
        const h1 = a.querySelector('h1');
        const name = h1?.textContent?.trim() || a.textContent?.trim() || '';
        const type = href.includes('type=business') ? 'business' as const : 'person' as const;
        if (href && name) {
          items.push({ name, url: href, type });
        }
      });
      return items;
    });

    all.push(...links);
    if (all.length >= MAX_RESULTS) break;

    const nextBtn = await page.$('a[rel="next"], .pagination .next a, li.next a');
    if (!nextBtn) break;

    log('pagination', `navigating to page ${pageNum + 1}`);
    await delay(staggerMs());
    await Promise.all([
      page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: NAV_TIMEOUT_MS,
      }),
      nextBtn.click(),
    ]);
    await delay(staggerMs());
    pageNum++;
  }

  return all.slice(0, MAX_RESULTS);
}

// ── Detail page scraping (public — no CAPTCHA) ──

export async function scrapeDetailPage(
  page: Page,
  url: string
): Promise<{ name: string; records: TexasLicenseRecord[]; zipCode: string | null }> {
  log('detail', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await page
    .waitForSelector('h1, th[scope="row"]', { timeout: 12_000 })
    .catch(() => undefined);
  await delay(Math.min(staggerMs(), 180));

  return page.evaluate(() => {
    function extractZipFromTexasPage(): string | null {
      const text = document.body?.innerText || '';
      const cityStateZip = text.match(/,\s*[A-Z]{2}\s+(\d{5})(?:-\d{4})?\b/);
      if (cityStateZip) return cityStateZip[1];
      const zipLine = text.match(/\bZIP\s*:?\s*(\d{5})\b/i);
      if (zipLine) return zipLine[1];
      return null;
    }

    const pageZip = extractZipFromTexasPage();

    const nameEl = document.querySelector('h1');
    const rawName = nameEl?.textContent?.trim() || '';
    const name = /^\[.*\]$/.test(rawName) ? '' : rawName;

    // Collect all h2 positions to determine section for each th[scope="row"]
    const allH2: { el: Element; text: string; offset: number }[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT
    );
    let nodeIndex = 0;
    let current = walker.currentNode as Element;
    while (current) {
      if (current.tagName === 'H2') {
        allH2.push({
          el: current,
          text: current.textContent?.trim() || '',
          offset: nodeIndex,
        });
      }
      nodeIndex++;
      const next = walker.nextNode();
      if (!next) break;
      current = next as Element;
    }

    const records: {
      name: string;
      license_type: string;
      section: string;
      issued_on: string | null;
      expiration_date: string | null;
      status: string | null;
      zip_code: string | null;
    }[] = [];

    document.querySelectorAll('th[scope="row"]').forEach((th) => {
      // License type = text content before any <div> child (modal)
      let licenseType = '';
      for (const node of th.childNodes) {
        if (node.nodeType === 3) licenseType += node.textContent;
        if (
          node.nodeType === 1 &&
          (node as Element).tagName === 'DIV'
        )
          break;
      }
      licenseType = licenseType.trim();
      if (!licenseType) return;

      const tr = th.closest('tr');
      if (!tr) return;

      // Direct child <td>s only (skip nested modal tables)
      const directTds: string[] = [];
      for (const child of tr.children) {
        if (child.tagName === 'TD') {
          directTds.push(child.textContent?.trim() || '');
        }
      }

      // Skip training entries (only 1 cell = date)
      if (directTds.length < 3) return;

      // Determine section by finding the nearest preceding h2
      let section = '';
      const thRect = th.getBoundingClientRect();
      for (let i = allH2.length - 1; i >= 0; i--) {
        const h2Rect = allH2[i].el.getBoundingClientRect();
        if (h2Rect.top <= thRect.top) {
          section = allH2[i].text;
          break;
        }
      }

      records.push({
        name,
        license_type: licenseType,
        section,
        issued_on: directTds[0] || null,
        expiration_date: directTds[1] || null,
        status: directTds[2] || null,
        zip_code: pageZip,
      });
    });

    return { name, records, zipCode: pageZip };
  });
}

// ── Main lookup function ──

export async function lookupTexasLicenses(params: {
  query: string;
  filter?: 'individual' | 'business' | 'training';
}): Promise<TexasLookupResult> {
  const query = params.query?.trim();
  if (!query) {
    return {
      ok: false,
      error: 'BAD_REQUEST',
      message: 'A search query is required.',
    };
  }
  const filter = params.filter || 'individual';

  // reCAPTCHA requires headful for the search page.
  // But if it looks like a direct person ID, skip search and go straight
  // to the detail page (which is public).
  const directIdMatch = query.match(/^(\d+)$/);
  const isLikelyDirectId =
    directIdMatch && parseInt(directIdMatch[1], 10) > 0;

  try {
    if (isLikelyDirectId) {
      return await withPage(true, async (page) => {
        const url = `${RESULT_BASE}/${query}?type=person`;
        const { name, records } = await scrapeDetailPage(page, url);
        if (records.length === 0) {
          return {
            ok: false,
            error: 'NO_RESULTS' as const,
            message: name
              ? `No license records found for ${name} (ID ${query}).`
              : `No results found for ID ${query}.`,
          };
        }
        return { ok: true as const, cached: false, results: records };
      });
    }

    return await withPage(false, async (page) => {
      await performSearch(page, query, filter);

      // Check if we landed on a detail page directly
      const currentUrl = page.url();
      if (currentUrl.includes('/search/result/')) {
        const { records } = await scrapeDetailPage(page, currentUrl);
        if (records.length === 0) {
          return {
            ok: false,
            error: 'NO_RESULTS' as const,
            message: 'No matching licensees found.',
          };
        }
        return { ok: true as const, cached: false, results: records };
      }

      // We're on the results list page
      const links = await scrapeResultLinks(page, MAX_PAGES);
      if (links.length === 0) {
        const noResults = await page.evaluate(() => {
          const body = document.body.textContent || '';
          return /no results|no records|not found/i.test(body);
        });
        return {
          ok: false,
          error: 'NO_RESULTS' as const,
          message: noResults
            ? 'No matching licensees found.'
            : 'Could not parse search results.',
        };
      }

      log('detail-scrape', `fetching ${links.length} detail pages`);

      const allRecords: TexasLicenseRecord[] = [];
      for (const link of links) {
        if (link.type !== 'person') continue;
        try {
          await delay(staggerMs());
          const { records } = await scrapeDetailPage(page, link.url);
          allRecords.push(...records);
        } catch (e) {
          log('detail-error', `failed for ${link.url}: ${(e as Error).message}`);
        }
        if (allRecords.length >= MAX_RESULTS) break;
      }

      if (allRecords.length === 0) {
        return {
          ok: false,
          error: 'NO_RESULTS' as const,
          message: 'No detailed license records could be loaded.',
        };
      }

      return {
        ok: true as const,
        cached: false,
        results: allRecords.slice(0, MAX_RESULTS),
      };
    });
  } catch (e: unknown) {
    if (e instanceof CaptchaTimeoutError) {
      return {
        ok: false,
        error: 'CAPTCHA_UNSOLVED',
        message: e.message,
      };
    }
    const err = e as { name?: string; message?: string };
    if (
      err?.name === 'TimeoutError' ||
      /timeout/i.test(err?.message || '')
    ) {
      return {
        ok: false,
        error: 'TIMEOUT',
        message: 'Texas TOPS request timed out.',
      };
    }
    log('error', err?.message || 'Unknown error');
    return {
      ok: false,
      error: 'LOAD_FAILED',
      message: err?.message || 'Failed to load or parse TOPS response.',
    };
  }
}
