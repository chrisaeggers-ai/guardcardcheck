import { Page, Browser, BrowserContext } from 'playwright';
import type { ScrapeResult } from './types';
declare function isTrainingLicense(licenseType: string): boolean;
declare function normalizeCity(city: string): string;
declare function launchBrowser(): Promise<{
    browser: Browser;
    context: BrowserContext;
}>;
/**
 * Scrape training facilities for a single city.
 */
export declare function scrapeCity(page: Page, city: string): Promise<ScrapeResult>;
export { launchBrowser, isTrainingLicense, normalizeCity };
