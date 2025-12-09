#!/usr/bin/env node

/**
 * Screenshot utility for visual QA
 * Usage: node scripts/screenshot.js [url] [name] [viewport]
 *
 * Examples:
 *   node scripts/screenshot.js http://localhost:5173 homepage
 *   node scripts/screenshot.js http://localhost:5173 mobile mobile
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 }
};

async function takeScreenshot(url, name, viewportName = 'desktop') {
  const viewport = VIEWPORTS[viewportName] || VIEWPORTS.desktop;
  const screenshotDir = path.join(__dirname, '..', 'screenshots', viewportName);

  // Ensure directory exists
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);

    // Wait for app to load
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for any animations to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    const filename = `${name}.png`;
    const filepath = path.join(screenshotDir, filename);

    await page.screenshot({
      path: filepath,
      fullPage: true
    });

    console.log(`Screenshot saved: ${filepath}`);
    return filepath;
  } finally {
    await browser.close();
  }
}

// Take screenshots of all tabs
async function screenshotAllTabs(baseUrl) {
  const tabs = ['current', 'history', 'statistics'];

  for (const viewport of Object.keys(VIEWPORTS)) {
    console.log(`\nCapturing ${viewport} screenshots...`);

    for (const tab of tabs) {
      // Navigate to tab (assuming URL hash routing or query params)
      await takeScreenshot(`${baseUrl}#${tab}`, `${tab}-tab`, viewport);
    }
  }
}

// CLI handling
const [,, url, name, viewport] = process.argv;

if (!url) {
  console.log('Usage: node scripts/screenshot.js <url> [name] [viewport]');
  console.log('       node scripts/screenshot.js <url> --all');
  console.log('');
  console.log('Viewports: desktop, tablet, mobile');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/screenshot.js http://localhost:5173 homepage');
  console.log('  node scripts/screenshot.js http://localhost:5173 --all');
  process.exit(1);
}

if (name === '--all') {
  screenshotAllTabs(url).catch(console.error);
} else {
  takeScreenshot(url, name || 'screenshot', viewport).catch(console.error);
}
