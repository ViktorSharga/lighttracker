const puppeteer = require('puppeteer');

const SOURCE_URL = process.env.SOURCE_URL || 'https://poweron.loe.lviv.ua/';

// Track fetch count to restart browser periodically
let fetchCount = 0;
const RESTART_AFTER_FETCHES = 12; // Restart browser every ~hour (12 * 5min)

async function fetchSchedulePage() {
  let browser = null;
  let page = null;

  try {
    // Launch fresh browser for each fetch to prevent memory/disk leaks
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--disable-cache',
        '--disk-cache-size=0',
        '--media-cache-size=0',
        '--aggressive-cache-discard'
      ]
    });

    page = await browser.newPage();

    // Disable cache
    await page.setCacheEnabled(false);

    // Block unnecessary resources to reduce memory
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(SOURCE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for content to load (React app renders into #root)
    await page.waitForSelector('#root', { timeout: 10000 });

    // Wait for React to render - either schedule data or empty state
    // Check for "Група" (schedule present) or wait for page to stabilize
    const hasSchedule = await page.waitForFunction(
      () => {
        const root = document.querySelector('#root');
        if (!root) return false;
        const text = root.innerText || '';
        // Schedule data present
        if (text.includes('Група')) return 'schedule';
        // Page loaded but no schedule - check for common "no data" indicators
        // or if the page has rendered something substantial
        if (text.includes('немає') || text.includes('відсутн') || text.length > 50) return 'no-schedule';
        return false;
      },
      { timeout: 30000 }
    ).then(handle => handle.jsonValue()).catch(() => null);

    const text = await page.evaluate(() => document.body.innerText);

    // If no schedule data, return indicator for parser to handle
    if (hasSchedule === 'no-schedule' && !text.includes('Група')) {
      return { text, noOutages: true };
    }

    return { text };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }
  }
}

module.exports = { fetchSchedulePage };
