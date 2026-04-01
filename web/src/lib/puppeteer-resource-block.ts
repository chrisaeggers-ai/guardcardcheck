import type { Page } from 'puppeteer';

/**
 * Skip images/fonts/media to speed up government portals without affecting form postbacks.
 */
export async function blockHeavyAssets(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (type === 'image' || type === 'font' || type === 'media') {
      void req.abort();
    } else {
      void req.continue();
    }
  });
}
