#!/usr/bin/env node

/**
 * QA Test Script - Comprehensive visual and functional testing
 *
 * Usage: node scripts/qa-test.js [url]
 *
 * Examples:
 *   node scripts/qa-test.js                     # Test localhost:3000
 *   node scripts/qa-test.js http://localhost:5173  # Test Vite dev server
 *
 * Run inside Docker:
 *   docker compose exec app node scripts/qa-test.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.argv[2] || process.env.QA_URL || 'http://localhost:3000';

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 }
};

// Tab selectors use Radix Vue's ID pattern: radix-vue-tabs-v-*-trigger-{name}
const TABS = [
  { name: 'current', selector: '[id*="-trigger-current"]', waitFor: '.group-card' },
  { name: 'history', selector: '[id*="-trigger-history"]', waitFor: '.glass-card' },
  { name: 'statistics', selector: '[id*="-trigger-statistics"]', waitFor: 'canvas' }
];

async function runQATests() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputDir = path.join(__dirname, '..', 'screenshots', `qa-${timestamp}`);

  console.log(`\n🔍 QA Testing: ${BASE_URL}`);
  console.log(`📁 Output: screenshots/qa-${timestamp}/\n`);

  const results = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    duration: 0,
    tests: [],
    errors: [],
    screenshots: []
  };

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote'
    ]
  });

  try {
    const page = await browser.newPage();

    // Collect console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore common non-critical errors
        if (!text.includes('favicon.ico') && !text.includes('net::ERR_')) {
          results.errors.push({
            type: 'console',
            message: text,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    page.on('pageerror', err => {
      results.errors.push({
        type: 'pageerror',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    });

    // Test each viewport
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      const viewportDir = path.join(outputDir, viewportName);
      fs.mkdirSync(viewportDir, { recursive: true });

      await page.setViewport(viewport);
      console.log(`\n📱 ${viewportName.toUpperCase()} (${viewport.width}x${viewport.height})`);

      // Test each tab
      for (const tab of TABS) {
        const testName = `${viewportName}/${tab.name}`;
        const testResult = { name: testName, passed: true, details: [] };

        try {
          // Navigate to app fresh for each tab
          await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });

          // Wait for Vue app to mount (Radix tabs use ID pattern)
          await page.waitForSelector('[id*="-trigger-current"]', { timeout: 10000 });
          testResult.details.push('App mounted');

          // Click tab if not current
          if (tab.name !== 'current') {
            const tabButton = await page.$(tab.selector);
            if (tabButton) {
              await tabButton.click();
              testResult.details.push(`Clicked ${tab.name} tab`);
              // Wait for tab transition and data load
              await new Promise(r => setTimeout(r, 1500));
            } else {
              testResult.details.push(`Tab button not found: ${tab.selector}`);
              testResult.passed = false;
            }
          }

          // Wait for expected content
          try {
            await page.waitForSelector(tab.waitFor, { timeout: 5000 });
            testResult.details.push(`Found: ${tab.waitFor}`);
          } catch {
            testResult.details.push(`Not found (may be empty state): ${tab.waitFor}`);
          }

          // Wait for GSAP animations to complete
          await new Promise(r => setTimeout(r, 2000));

          // Take screenshot
          const filename = `${tab.name}-tab.png`;
          const filepath = path.join(viewportDir, filename);
          await page.screenshot({ path: filepath, fullPage: true });

          results.screenshots.push({
            viewport: viewportName,
            tab: tab.name,
            path: filepath.replace(path.join(__dirname, '..') + '/', '')
          });

          testResult.details.push('Screenshot captured');
          console.log(`  ✓ ${tab.name}`);

        } catch (err) {
          testResult.passed = false;
          testResult.error = err.message;
          console.log(`  ✗ ${tab.name}: ${err.message}`);
        }

        results.tests.push(testResult);
      }
    }

    // Additional tests: Check for interactive elements
    console.log('\n🔧 FUNCTIONAL TESTS');

    await page.setViewport(VIEWPORTS.desktop);
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('[id*="-trigger-current"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));

    // Test: Group card click navigation
    try {
      const groupCard = await page.$('.group-card');
      if (groupCard) {
        await groupCard.click();
        await new Promise(r => setTimeout(r, 1500));

        // Check if we navigated to history
        const historyTab = await page.$('[id*="-trigger-history"][data-state="active"]');
        if (historyTab) {
          results.tests.push({ name: 'functional/group-card-click', passed: true, details: ['Navigates to history'] });
          console.log('  ✓ Group card click navigates to history');
        } else {
          results.tests.push({ name: 'functional/group-card-click', passed: false, details: ['Did not navigate'] });
          console.log('  ✗ Group card click did not navigate');
        }
      } else {
        results.tests.push({ name: 'functional/group-card-click', passed: true, details: ['No group cards to test'] });
        console.log('  ○ No group cards to test');
      }
    } catch (err) {
      results.tests.push({ name: 'functional/group-card-click', passed: false, error: err.message });
      console.log(`  ✗ Group card test failed: ${err.message}`);
    }

    // Calculate duration
    results.duration = Date.now() - startTime;

    // Write report
    const reportPath = path.join(outputDir, 'qa-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

    // Print summary
    const passedTests = results.tests.filter(t => t.passed).length;
    const totalTests = results.tests.length;

    console.log('\n' + '='.repeat(50));
    console.log('QA TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Tests: ${passedTests}/${totalTests} passed`);
    console.log(`Screenshots: ${results.screenshots.length}`);
    console.log(`Errors: ${results.errors.length}`);
    console.log(`Duration: ${(results.duration / 1000).toFixed(1)}s`);
    console.log(`Report: screenshots/qa-${timestamp}/qa-report.json`);

    if (results.errors.length > 0) {
      console.log('\n⚠️  ERRORS DETECTED:');
      results.errors.forEach((e, i) => {
        console.log(`  ${i + 1}. [${e.type}] ${e.message.substring(0, 100)}`);
      });
    }

    if (passedTests === totalTests && results.errors.length === 0) {
      console.log('\n✅ All tests passed with no errors!');
    } else if (passedTests < totalTests) {
      console.log('\n❌ Some tests failed - check screenshots and report');
      process.exitCode = 1;
    }

  } finally {
    await browser.close();
  }

  return results;
}

runQATests().catch(err => {
  console.error('\n💥 QA test failed:', err.message);
  process.exit(1);
});
