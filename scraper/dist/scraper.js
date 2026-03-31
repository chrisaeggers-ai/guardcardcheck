"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeCity = scrapeCity;
exports.launchBrowser = launchBrowser;
exports.isTrainingLicense = isTrainingLicense;
exports.normalizeCity = normalizeCity;
const playwright_1 = require("playwright");
const BASE_URL = 'https://search.dca.ca.gov';
const TRAINING_LICENSE_KEYWORDS = [
    'training facility',
    'training',
    'tff',
    'baton training',
    'firearm training',
    'approved trainer',
];
function isTrainingLicense(licenseType) {
    const lower = licenseType.toLowerCase().trim();
    return TRAINING_LICENSE_KEYWORDS.some((kw) => lower.includes(kw));
}
function normalizeCity(city) {
    return city
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}
function randomDelay(min = 1000, max = 3000) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((r) => setTimeout(r, ms));
}
async function simulateHumanMouse(page) {
    const x = 200 + Math.floor(Math.random() * 400);
    const y = 200 + Math.floor(Math.random() * 300);
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
}
async function launchBrowser() {
    const browser = await playwright_1.chromium.launch({
        headless: false,
        slowMo: 50,
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
        locale: 'en-US',
    });
    return { browser, context };
}
/**
 * Extract result rows from the current page of search results.
 */
async function extractResults(page) {
    await page.waitForSelector('.ag-body-viewport .ag-row, .search-results-table tr, [class*="result"]', {
        timeout: 15000,
    }).catch(() => null);
    // The DCA search site uses an AG Grid or a custom table.
    // Try multiple selector strategies to be resilient.
    const results = [];
    // Strategy 1: AG Grid rows (most common on search.dca.ca.gov)
    const agRows = await page.$$('.ag-body-viewport .ag-row');
    if (agRows.length > 0) {
        for (const row of agRows) {
            const cells = await row.$$('.ag-cell');
            const texts = [];
            for (const cell of cells) {
                texts.push((await cell.textContent() ?? '').trim());
            }
            if (texts.length >= 3) {
                results.push(parseRowTexts(texts));
            }
        }
        return results;
    }
    // Strategy 2: Standard HTML table rows
    const tableRows = await page.$$('table tbody tr, .search-results tr');
    if (tableRows.length > 0) {
        for (const row of tableRows) {
            const cells = await row.$$('td');
            const texts = [];
            for (const cell of cells) {
                texts.push((await cell.textContent() ?? '').trim());
            }
            if (texts.length >= 3) {
                results.push(parseRowTexts(texts));
            }
        }
        return results;
    }
    // Strategy 3: Card-style results (the site renders individual result blocks)
    const resultCards = await page.$$('[class*="result-item"], [class*="search-result"], .card');
    for (const card of resultCards) {
        const text = (await card.textContent() ?? '').trim();
        if (!text)
            continue;
        results.push(parseCardText(text));
    }
    return results;
}
/**
 * Parse an array of cell texts into a TrainingCenter.
 * Column order varies; we use heuristics to identify fields.
 */
function parseRowTexts(texts) {
    let name = '';
    let licenseNumber = '';
    let licenseType = '';
    let address = '';
    let city = '';
    for (const t of texts) {
        if (/^\d{4,}$/.test(t.replace(/\s/g, '')) && !licenseNumber) {
            licenseNumber = t;
        }
        else if (/training|guard|patrol|alarm|locksmith|investigat|firearm|baton|repossess/i.test(t) &&
            !licenseType) {
            licenseType = t;
        }
        else if (/\d{5}/.test(t) && /[A-Z]{2}\s+\d{5}|CA\s/i.test(t) && !address) {
            address = t;
        }
        else if (!name && t.length > 2) {
            name = t;
        }
    }
    // If we still have unmatched texts, fill in blanks
    if (!address && texts.length > 3)
        address = texts[3] || '';
    if (!licenseType && texts.length > 2)
        licenseType = texts[2] || '';
    if (!licenseNumber && texts.length > 1)
        licenseNumber = texts[1] || '';
    city = extractCityFromAddress(address);
    return {
        name: name.trim(),
        license_number: licenseNumber.trim(),
        license_type: licenseType.trim(),
        address: address.trim(),
        city: normalizeCity(city),
    };
}
function parseCardText(text) {
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    return {
        name: lines[0] || '',
        license_number: lines.find((l) => /^\d{4,}$/.test(l.replace(/\s/g, ''))) || '',
        license_type: lines.find((l) => /training|firearm|baton/i.test(l)) || '',
        address: lines.find((l) => /\d{5}/.test(l)) || '',
        city: normalizeCity(extractCityFromAddress(lines.find((l) => /\d{5}/.test(l)) || '')),
    };
}
function extractCityFromAddress(address) {
    if (!address)
        return '';
    // Pattern: "CITY, CA 91234" or "CITY CA 91234"
    const match = address.match(/([A-Za-z\s]+),?\s*CA\s+\d{5}/i);
    if (match)
        return match[1].trim();
    // Fallback: last word cluster before a ZIP
    const zip = address.match(/([A-Za-z\s]+)\s+\d{5}/);
    if (zip)
        return zip[1].trim().split(',').pop()?.trim() || '';
    return '';
}
/**
 * Handle pagination: click "Next" until no more pages.
 */
async function collectAllPages(page) {
    const all = [];
    let pageNum = 1;
    while (true) {
        console.log(`    Page ${pageNum}...`);
        const batch = await extractResults(page);
        all.push(...batch);
        console.log(`    Extracted ${batch.length} rows (cumulative: ${all.length})`);
        // Look for a "Next" or ">" pagination button
        const nextBtn = await page.$('button:has-text("Next"), a:has-text("Next"), [aria-label="Next"], .pagination-next, button:has-text(">")');
        if (!nextBtn)
            break;
        const isDisabled = await nextBtn.getAttribute('disabled');
        const ariaDisabled = await nextBtn.getAttribute('aria-disabled');
        if (isDisabled !== null || ariaDisabled === 'true')
            break;
        await simulateHumanMouse(page);
        await nextBtn.click();
        await randomDelay(1500, 3000);
        await page.waitForLoadState('networkidle').catch(() => { });
        pageNum++;
        if (pageNum > 50) {
            console.log('    Safety limit: stopping at 50 pages');
            break;
        }
    }
    return all;
}
/**
 * Scrape training facilities for a single city.
 */
async function scrapeCity(page, city) {
    console.log(`\n🔍 Scraping: ${city}`);
    // Navigate to the search page
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await randomDelay(1500, 2500);
    await simulateHumanMouse(page);
    // Select "Security and Investigative Services, Bureau of" from the board dropdown
    const boardSelect = page.locator('select').filter({ hasText: /Security and Investigative/i }).first();
    const boardExists = await boardSelect.count();
    if (boardExists > 0) {
        await boardSelect.selectOption({ label: 'Security and Investigative Services, Bureau of' });
        await randomDelay(800, 1500);
    }
    else {
        // Try looking for any dropdown that has BSIS as an option
        const selects = page.locator('select');
        const count = await selects.count();
        for (let i = 0; i < count; i++) {
            const sel = selects.nth(i);
            const html = await sel.innerHTML();
            if (/Security and Investigative/i.test(html)) {
                await sel.selectOption({ label: 'Security and Investigative Services, Bureau of' });
                await randomDelay(800, 1500);
                break;
            }
        }
    }
    // Try to find and fill city field — it may be on the advanced search page
    const cityInput = page.locator('input[placeholder*="City" i], input[name*="city" i], #city').first();
    const cityExists = await cityInput.count();
    if (cityExists > 0) {
        await cityInput.fill(city);
        await randomDelay(500, 1000);
    }
    else {
        // Navigate to advanced search
        const advLink = page.locator('a:has-text("Advanced Search"), a[href*="advanced"]').first();
        if ((await advLink.count()) > 0) {
            await advLink.click();
            await page.waitForLoadState('networkidle');
            await randomDelay(1000, 2000);
            // Re-select board on advanced page
            const advBoard = page.locator('select').first();
            const advBoardHtml = await advBoard.innerHTML().catch(() => '');
            if (/Security and Investigative/i.test(advBoardHtml)) {
                await advBoard.selectOption({ label: 'Security and Investigative Services, Bureau of' });
                await randomDelay(800, 1200);
            }
            // Fill city
            const advCity = page.locator('input[placeholder*="City" i], input[name*="city" i], #city').first();
            if ((await advCity.count()) > 0) {
                await advCity.fill(city);
                await randomDelay(500, 1000);
            }
        }
    }
    // Try to select training-specific license types if a license type dropdown exists
    await selectTrainingLicenseTypes(page);
    await simulateHumanMouse(page);
    // Submit the search
    const searchBtn = page.locator('button:has-text("Search"), input[type="submit"], button[type="submit"]').first();
    if ((await searchBtn.count()) > 0) {
        await searchBtn.click();
    }
    else {
        await page.keyboard.press('Enter');
    }
    // Wait for results
    await randomDelay(2000, 4000);
    await page.waitForLoadState('networkidle').catch(() => { });
    // Check for "no results" message
    const noResults = await page
        .locator('text=/no results|no records|0 results/i')
        .first()
        .count();
    if (noResults > 0) {
        console.log(`  ⚠ No results found for "${city}"`);
        return { city, total: 0, filtered: 0, data: [] };
    }
    // Collect all pages of results
    const allResults = await collectAllPages(page);
    console.log(`  📋 Total rows extracted: ${allResults.length}`);
    // Filter to training-related licenses only
    const training = allResults.filter((r) => isTrainingLicense(r.license_type));
    console.log(`  ✅ Training facilities after filter: ${training.length}`);
    // Normalize cities
    const normalized = training.map((r) => ({
        ...r,
        name: r.name.trim(),
        city: normalizeCity(r.city || city),
        address: r.address.trim(),
        license_number: r.license_number.replace(/\s/g, ''),
    }));
    return { city, total: allResults.length, filtered: normalized.length, data: normalized };
}
/**
 * If the page has a license-type multi-select or dropdown, pick training types.
 */
async function selectTrainingLicenseTypes(page) {
    const selects = page.locator('select');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
        const sel = selects.nth(i);
        const html = await sel.innerHTML().catch(() => '');
        if (/Training Facility|Baton Training|Firearm Training|Approved Trainer/i.test(html)) {
            // This is the license type dropdown — select all training options
            const options = await sel.locator('option').allTextContents();
            const trainingOptions = options.filter((o) => /training|tff|approved trainer/i.test(o));
            if (trainingOptions.length > 0) {
                console.log(`  📝 Selecting license types: ${trainingOptions.join(', ')}`);
                for (const opt of trainingOptions) {
                    await sel.selectOption({ label: opt.trim() });
                    await randomDelay(300, 600);
                }
            }
            break;
        }
    }
}
//# sourceMappingURL=scraper.js.map