#!/usr/bin/env node

/**
 * Migration script - Converts all infoTimestamp fields from "HH:MM DD.MM.YYYY" to ISO 8601 format
 *
 * Usage:
 *   node scripts/migrate-to-iso.js [input-file] [output-file]
 *
 * Examples:
 *   node scripts/migrate-to-iso.js                                    # Migrate ./data/schedules.json in place
 *   node scripts/migrate-to-iso.js ./backup.json ./migrated.json      # Migrate backup to new file
 *
 * Run inside Docker:
 *   docker compose exec lighttracker node scripts/migrate-to-iso.js
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const INPUT_FILE = process.argv[2] || path.join(DEFAULT_DATA_DIR, 'schedules.json');
const OUTPUT_FILE = process.argv[3] || INPUT_FILE;

/**
 * Convert "HH:MM DD.MM.YYYY" format to ISO 8601
 * @param {string} infoTimestamp - Timestamp in "HH:MM DD.MM.YYYY" format
 * @returns {string} ISO 8601 timestamp or original if already ISO/invalid
 */
function convertToISO(infoTimestamp) {
  if (!infoTimestamp) return infoTimestamp;

  // Check if already ISO format (starts with year and contains 'T')
  if (/^\d{4}-\d{2}-\d{2}T/.test(infoTimestamp)) {
    return infoTimestamp;
  }

  // Parse "HH:MM DD.MM.YYYY" format
  const match = infoTimestamp.match(/^(\d{2}):(\d{2}) (\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return infoTimestamp; // Return as-is if format doesn't match
  }

  const [, hours, minutes, day, month, year] = match;
  const date = new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hours, 10),
    parseInt(minutes, 10)
  );

  // Validate the date is valid
  if (isNaN(date.getTime())) {
    console.warn(`  ⚠️  Invalid date: ${infoTimestamp}`);
    return infoTimestamp;
  }

  return date.toISOString();
}

/**
 * Check if a timestamp is in ISO format
 */
function isISO(timestamp) {
  return /^\d{4}-\d{2}-\d{2}T/.test(timestamp);
}

async function migrate() {
  console.log(`\n🔄 LightTracker ISO Migration`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Input:  ${INPUT_FILE}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  // Check if input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  // Read data
  console.log('📖 Reading data...');
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

  const stats = {
    datesProcessed: 0,
    recordsProcessed: 0,
    timestampsConverted: 0,
    alreadyISO: 0,
    errors: 0
  };

  const dateKeys = Object.keys(data).sort();
  stats.datesProcessed = dateKeys.length;

  console.log(`   Found ${dateKeys.length} dates\n`);
  console.log('🔄 Converting timestamps...');

  // Process each date
  for (const dateKey of dateKeys) {
    const records = data[dateKey];
    process.stdout.write(`   ${dateKey}: `);

    let dateConverted = 0;
    let dateSkipped = 0;

    for (const record of records) {
      stats.recordsProcessed++;

      // Convert infoTimestamp
      if (record.infoTimestamp) {
        const original = record.infoTimestamp;

        if (isISO(original)) {
          dateSkipped++;
          stats.alreadyISO++;
        } else {
          const converted = convertToISO(original);
          if (converted !== original) {
            record.infoTimestamp = converted;
            dateConverted++;
            stats.timestampsConverted++;
          } else {
            stats.errors++;
            console.warn(`\n      ⚠️  Failed to convert: ${original}`);
          }
        }
      }
    }

    console.log(`${dateConverted} converted, ${dateSkipped} already ISO`);
  }

  // Write output
  console.log(`\n💾 Writing migrated data...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

  const outputStats = fs.statSync(OUTPUT_FILE);
  const sizeKB = (outputStats.size / 1024).toFixed(2);

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 MIGRATION SUMMARY');
  console.log(`${'='.repeat(50)}`);
  console.log(`   Dates processed:     ${stats.datesProcessed}`);
  console.log(`   Records processed:   ${stats.recordsProcessed}`);
  console.log(`   Timestamps converted: ${stats.timestampsConverted}`);
  console.log(`   Already ISO:         ${stats.alreadyISO}`);
  console.log(`   Errors:              ${stats.errors}`);
  console.log(`   Output file size:    ${sizeKB} KB`);

  if (stats.errors > 0) {
    console.log(`\n⚠️  Some timestamps could not be converted. Check warnings above.`);
  }

  if (stats.timestampsConverted > 0 || stats.alreadyISO === stats.recordsProcessed) {
    console.log(`\n✅ MIGRATION COMPLETE`);
  } else {
    console.log(`\n⚠️  No timestamps were converted. Data may already be in ISO format.`);
  }

  // Verification
  console.log(`\n🔍 Verification:`);
  const verifyData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  let allISO = true;
  let sampleTimestamp = null;

  for (const dateKey of Object.keys(verifyData)) {
    for (const record of verifyData[dateKey]) {
      if (record.infoTimestamp) {
        if (!sampleTimestamp) sampleTimestamp = record.infoTimestamp;
        if (!isISO(record.infoTimestamp)) {
          allISO = false;
          console.log(`   ❌ Non-ISO timestamp found: ${record.infoTimestamp}`);
        }
      }
    }
  }

  if (allISO) {
    console.log(`   ✅ All timestamps are in ISO format`);
    if (sampleTimestamp) {
      console.log(`   📝 Sample: ${sampleTimestamp}`);
    }
  }
}

migrate().catch(err => {
  console.error(`\n❌ Migration failed: ${err.message}`);
  process.exit(1);
});
