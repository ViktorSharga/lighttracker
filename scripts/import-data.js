#!/usr/bin/env node

/**
 * Script to import historical schedule data to a remote LightTracker instance
 *
 * Usage:
 *   node scripts/import-data.js <base-url> [data-file]
 *
 * Examples:
 *   node scripts/import-data.js http://localhost:3000
 *   node scripts/import-data.js https://lighttracker.example.com ./data/schedules.json
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2];
const DATA_FILE = process.argv[3] || path.join(__dirname, '..', 'data', 'schedules.json');

if (!BASE_URL) {
  console.error('Usage: node scripts/import-data.js <base-url> [data-file]');
  console.error('Example: node scripts/import-data.js http://localhost:3000');
  process.exit(1);
}

async function importSchedule(record) {
  const response = await fetch(`${BASE_URL}/api/schedule/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });
  return response.json();
}

async function main() {
  console.log(`Reading data from: ${DATA_FILE}`);
  console.log(`Importing to: ${BASE_URL}`);
  console.log('');

  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Error: Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const dates = Object.keys(data).sort();

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const dateKey of dates) {
    const records = data[dateKey];
    console.log(`Processing ${dateKey}: ${records.length} record(s)`);

    for (const record of records) {
      try {
        const result = await importSchedule(record);

        if (result.imported) {
          imported++;
          process.stdout.write('.');
        } else if (result.reason === 'duplicate') {
          skipped++;
          process.stdout.write('s');
        } else {
          failed++;
          process.stdout.write('x');
          console.error(`\n  Failed: ${record.fetchedAt} - ${result.reason}`);
        }
      } catch (err) {
        failed++;
        process.stdout.write('E');
        console.error(`\n  Error: ${record.fetchedAt} - ${err.message}`);
      }
    }
    console.log('');
  }

  console.log('');
  console.log('=== Import Summary ===');
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (duplicates): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${imported + skipped + failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
