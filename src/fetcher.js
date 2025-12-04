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

    // Give React a moment to render
    await page.waitForFunction(
      () => document.querySelector('#root')?.innerText?.includes('Група'),
      { timeout: 15000 }
    );

    const text = await page.evaluate(() => document.body.innerText);

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
