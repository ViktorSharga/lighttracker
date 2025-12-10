#!/usr/bin/env node

/**
 * Backup script - Downloads all schedule data from a LightTracker instance
 *
 * Usage:
 *   node scripts/backup-data.js <base-url> <output-file>
 *
 * Examples:
 *   node scripts/backup-data.js https://lighttracker.up.railway.app ./backups/prod-backup.json
 *   node scripts/backup-data.js http://localhost:3000 ./backups/local-backup.json
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2];
const OUTPUT_FILE = process.argv[3];

if (!BASE_URL || !OUTPUT_FILE) {
  console.error('Usage: node scripts/backup-data.js <base-url> <output-file>');
  console.error('Example: node scripts/backup-data.js https://lighttracker.up.railway.app ./backups/prod-backup.json');
  process.exit(1);
}

async function backup() {
  console.log(`\n📦 LightTracker Data Backup`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Source: ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  try {
    // Fetch all schedule data
    console.log('⏳ Fetching data from /api/export...');
    const response = await fetch(`${BASE_URL}/api/export`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Calculate statistics
    const dateKeys = Object.keys(data);
    let totalRecords = 0;
    for (const dateKey of dateKeys) {
      totalRecords += data[dateKey].length;
    }

    console.log(`✅ Data fetched successfully`);
    console.log(`   - Dates: ${dateKeys.length}`);
    console.log(`   - Records: ${totalRecords}`);

    if (dateKeys.length > 0) {
      const sortedDates = dateKeys.sort();
      console.log(`   - Date range: ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}`);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (outputDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`\n📁 Created directory: ${outputDir}`);
    }

    // Write backup file
    console.log(`\n💾 Writing backup file...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

    const stats = fs.statSync(OUTPUT_FILE);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`✅ Backup saved: ${OUTPUT_FILE}`);
    console.log(`   - Size: ${sizeKB} KB`);

    // Verification
    console.log(`\n🔍 Verification:`);
    const verifyData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    const verifyDates = Object.keys(verifyData);
    let verifyRecords = 0;
    for (const dateKey of verifyDates) {
      verifyRecords += verifyData[dateKey].length;
    }

    if (verifyDates.length === dateKeys.length && verifyRecords === totalRecords) {
      console.log(`   ✅ Dates match: ${verifyDates.length}`);
      console.log(`   ✅ Records match: ${verifyRecords}`);
    } else {
      console.log(`   ❌ Mismatch detected!`);
      console.log(`      Expected ${dateKeys.length} dates, got ${verifyDates.length}`);
      console.log(`      Expected ${totalRecords} records, got ${verifyRecords}`);
      process.exit(1);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ BACKUP COMPLETE`);
    console.log(`\nPlease verify this file is safely stored before proceeding.`);

  } catch (err) {
    console.error(`\n❌ Backup failed: ${err.message}`);
    process.exit(1);
  }
}

backup();
