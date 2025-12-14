/**
 * @fileoverview Express server for LightTracker - Power outage schedule tracker for Lviv, Ukraine.
 *
 * This module is the main entry point for the application. It provides:
 * - REST API endpoints for schedule data, statistics, and history
 * - Periodic fetching of schedule data from the source website
 * - Telegram bot integration for subscriber notifications
 * - Vue SPA frontend serving
 *
 * @module server
 * @requires express
 * @requires ./fetcher - Puppeteer-based web scraper
 * @requires ./parser - Ukrainian text parser for schedule extraction
 * @requires ./storage - JSON file persistence layer
 * @requires ./comparator - Schedule comparison and statistics
 * @requires ./telegram - Telegram bot for notifications
 *
 * @example
 * // Start the server (via Docker)
 * docker compose up -d --build
 *
 * // The server will:
 * // 1. Start Express on PORT (default 3000)
 * // 2. Initialize Telegram bot if TELEGRAM_BOT_TOKEN is set
 * // 3. Begin periodic fetching after INITIAL_FETCH_DELAY (5s)
 * // 4. Fetch schedules every FETCH_INTERVAL_MS (default 5 min)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { fetchSchedulePage } = require('./fetcher');
const { parseAllSchedules } = require('./parser');
const { addSchedule, getLatestSchedules, getAllDates, getSchedulesForDate, getAllSchedules, importSchedule, deleteSchedule } = require('./storage');
const { compareSchedules, buildDaySummary, calculateStatistics } = require('./comparator');
const { initTelegramBot, notifySubscribers, getSubscriberCount, getSubscribersByGroup } = require('./telegram');

const app = express();

/**
 * HTTP server port.
 * @constant {number}
 * @default 3000
 */
const PORT = process.env.PORT || 3000;

/**
 * Interval between automatic schedule fetches in milliseconds.
 * @constant {number}
 * @default 300000 (5 minutes)
 */
const FETCH_INTERVAL_MS = parseInt(process.env.FETCH_INTERVAL_MS) || 300000;

/**
 * Telegram bot token for notifications. If not set, bot is disabled.
 * @constant {string|undefined}
 */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Application version read from VERSION file at startup.
 * @constant {string}
 */
const VERSION = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();

/**
 * ISO timestamp of the last successful fetch operation.
 * Null if no fetch has completed yet.
 * @type {string|null}
 */
let lastFetchTime = null;

/**
 * Error message from the last failed fetch operation.
 * Null if the last fetch was successful or no fetch has been attempted.
 * @type {string|null}
 */
let lastFetchError = null;

/**
 * Flag indicating whether a fetch operation is currently in progress.
 * Used to prevent concurrent fetches which could cause race conditions.
 * @type {boolean}
 */
let isFetching = false;

// Initialize Telegram bot
initTelegramBot(TELEGRAM_BOT_TOKEN, getLatestSchedules);

// Parse JSON bodies
app.use(express.json());

// Serve Vue frontend
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /api/schedule - Get the current schedule with comparison to previous version.
 *
 * Returns the latest schedule for the most recent date, along with the previous
 * version (if any) and a detailed comparison showing changes per group.
 *
 * @name GetCurrentSchedule
 * @route {GET} /api/schedule
 * @returns {Object} Response object
 * @returns {string} response.version - Application version
 * @returns {string|null} response.lastFetchTime - ISO timestamp of last fetch
 * @returns {string|null} response.lastFetchError - Last fetch error message
 * @returns {boolean} response.isFetching - Whether fetch is in progress
 * @returns {string} response.dateKey - Date key in YYYY-MM-DD format
 * @returns {Object|null} response.current - Latest schedule record
 * @returns {Object|null} response.previous - Previous schedule record (for comparison)
 * @returns {Object} response.comparison - Comparison result with per-group changes
 *
 * @example
 * // Response structure
 * {
 *   "version": "1.2.3",
 *   "lastFetchTime": "2025-12-14T10:00:00.000Z",
 *   "lastFetchError": null,
 *   "isFetching": false,
 *   "dateKey": "2025-12-14",
 *   "current": {
 *     "fetchedAt": "2025-12-14T10:00:00.000Z",
 *     "scheduleDate": "14.12.2025",
 *     "infoTimestamp": "10:00 14.12.2025",
 *     "groups": {
 *       "1.1": {
 *         "intervalsText": "з 09:00 до 12:30",
 *         "intervals": [{ "start": "09:00", "end": "12:30", "durationMinutes": 210 }],
 *         "totalMinutesOff": 210
 *       }
 *       // ... 12 groups total
 *     }
 *   },
 *   "previous": { ... },  // Same structure as current, or null
 *   "comparison": {
 *     "hasChanges": true,
 *     "groupChanges": {
 *       "1.1": { "status": "better", "differenceMinutes": -60 }
 *     },
 *     "summary": { "totalMinutesChange": -60, "humanReadable": "..." }
 *   }
 * }
 */
app.get('/api/schedule', (req, res) => {
  const { current, previous, dateKey } = getLatestSchedules();
  const comparison = compareSchedules(current, previous);

  res.json({
    version: VERSION,
    lastFetchTime,
    lastFetchError,
    isFetching,
    dateKey,
    current,
    previous,
    comparison
  });
});

/**
 * GET /api/dates - Get all dates that have schedule data.
 *
 * Returns a list of date keys (YYYY-MM-DD format) for which schedule data exists,
 * sorted in descending order (most recent first).
 *
 * @name GetAllDates
 * @route {GET} /api/dates
 * @returns {Object} Response object
 * @returns {string[]} response.dates - Array of date keys in YYYY-MM-DD format
 *
 * @example
 * // Response
 * {
 *   "dates": ["2025-12-14", "2025-12-13", "2025-12-12"]
 * }
 */
app.get('/api/dates', (req, res) => {
  const dates = getAllDates();
  res.json({ dates });
});

/**
 * GET /api/schedule/:dateKey - Get all schedule versions for a specific date.
 *
 * Returns the full history of schedule versions for a given date, including
 * the current (latest) version, previous version, and comparison between them.
 * The allVersions array contains the complete history in chronological order.
 *
 * @name GetScheduleByDate
 * @route {GET} /api/schedule/:dateKey
 * @param {string} dateKey - Date in YYYY-MM-DD format (e.g., "2025-12-14")
 * @returns {Object} Response object
 * @returns {string} response.dateKey - The requested date key
 * @returns {Object} response.current - Latest schedule version for this date
 * @returns {Object|null} response.previous - Previous version (null if only one exists)
 * @returns {Object} response.comparison - Comparison between current and previous
 * @returns {Object[]} response.allVersions - All versions in chronological order
 * @throws {404} No schedules found for this date
 *
 * @example
 * // GET /api/schedule/2025-12-14
 * // Response
 * {
 *   "dateKey": "2025-12-14",
 *   "current": { "fetchedAt": "...", "groups": {...} },
 *   "previous": { "fetchedAt": "...", "groups": {...} },
 *   "comparison": { "hasChanges": true, ... },
 *   "allVersions": [
 *     { "fetchedAt": "2025-12-14T06:00:00Z", ... },
 *     { "fetchedAt": "2025-12-14T10:00:00Z", ... },
 *     { "fetchedAt": "2025-12-14T14:00:00Z", ... }  // current
 *   ]
 * }
 */
app.get('/api/schedule/:dateKey', (req, res) => {
  const { dateKey } = req.params;
  const schedules = getSchedulesForDate(dateKey);

  if (schedules.length === 0) {
    return res.status(404).json({ error: 'No schedules found for this date' });
  }

  const current = schedules[schedules.length - 1];
  const previous = schedules[schedules.length - 2] || null;
  const comparison = compareSchedules(current, previous);

  res.json({
    dateKey,
    current,
    previous,
    comparison,
    allVersions: schedules
  });
});

/**
 * GET /api/history/:dateKey - Get day history with change timeline summary.
 *
 * Returns a summary of all changes that occurred on a specific date, including
 * a timeline of when updates happened and what changed. Useful for understanding
 * how the schedule evolved throughout the day.
 *
 * @name GetDayHistory
 * @route {GET} /api/history/:dateKey
 * @param {string} dateKey - Date in YYYY-MM-DD format (e.g., "2025-12-14")
 * @returns {Object} Response object
 * @returns {string} response.dateKey - The requested date key
 * @returns {Object} response.summary - Day summary with change timeline
 * @returns {Object[]} response.summary.timeline - Array of change events
 * @returns {Object} response.summary.totals - Aggregated statistics for the day
 * @returns {Object[]} response.schedules - All schedule versions for this date
 * @throws {404} No schedules found for this date
 *
 * @example
 * // GET /api/history/2025-12-14
 * // Response
 * {
 *   "dateKey": "2025-12-14",
 *   "summary": {
 *     "timeline": [
 *       { "time": "06:00", "event": "initial", "description": "Перший графік" },
 *       { "time": "10:00", "event": "update", "groupsChanged": ["1.1", "2.2"] }
 *     ],
 *     "totals": { "versionCount": 3, "totalChanges": 2 }
 *   },
 *   "schedules": [...]
 * }
 */
app.get('/api/history/:dateKey', (req, res) => {
  const { dateKey } = req.params;
  const schedules = getSchedulesForDate(dateKey);

  if (schedules.length === 0) {
    return res.status(404).json({ error: 'No schedules found for this date' });
  }

  const summary = buildDaySummary(schedules);

  res.json({
    dateKey,
    summary,
    schedules
  });
});

/**
 * GET /api/statistics - Get aggregated statistics across multiple days.
 *
 * Calculates statistics for all schedule data within an optional date range.
 * Includes per-group averages, totals, and comparison data. Supports filtering
 * out weekends for business-day-only analysis.
 *
 * @name GetStatistics
 * @route {GET} /api/statistics
 * @queryparam {string} [from] - Start date in YYYY-MM-DD format (inclusive)
 * @queryparam {string} [to] - End date in YYYY-MM-DD format (inclusive)
 * @queryparam {string} [excludeWeekends] - Set to "true" or "1" to exclude Sat/Sun
 * @returns {Object} Statistics response
 * @returns {string} response.from - Actual start date used
 * @returns {string} response.to - Actual end date used
 * @returns {number} response.daysCount - Number of days included
 * @returns {Object} response.byGroup - Per-group statistics
 * @returns {number} response.byGroup[groupId].averageMinutesOff - Daily average
 * @returns {number} response.byGroup[groupId].totalMinutesOff - Total across period
 * @returns {number} response.byGroup[groupId].maxMinutesOff - Worst day
 * @returns {number} response.byGroup[groupId].minMinutesOff - Best day
 * @returns {Object} response.daily - Per-day breakdown
 *
 * @example
 * // GET /api/statistics?from=2025-12-01&to=2025-12-14&excludeWeekends=true
 * // Response
 * {
 *   "from": "2025-12-01",
 *   "to": "2025-12-14",
 *   "daysCount": 10,
 *   "byGroup": {
 *     "1.1": {
 *       "averageMinutesOff": 240,
 *       "totalMinutesOff": 2400,
 *       "maxMinutesOff": 360,
 *       "minMinutesOff": 120
 *     }
 *     // ... all 12 groups
 *   },
 *   "daily": {
 *     "2025-12-01": { "1.1": 240, "1.2": 180, ... }
 *     // ... per-day breakdown
 *   }
 * }
 */
app.get('/api/statistics', (req, res) => {
  const { from, to, excludeWeekends } = req.query;
  const schedulesByDate = getAllSchedules();

  // Parse excludeWeekends as boolean (query params are strings)
  const excludeWeekendsFlag = excludeWeekends === 'true' || excludeWeekends === '1';

  const statistics = calculateStatistics(
    schedulesByDate,
    from || null,
    to || null,
    excludeWeekendsFlag
  );

  res.json(statistics);
});

/**
 * GET /api/export - Export all schedule data for backup or transfer.
 *
 * Returns all schedule data organized by date key. Useful for:
 * - Backing up data before migrations
 * - Transferring data between instances
 * - Data analysis in external tools
 *
 * @name ExportAllSchedules
 * @route {GET} /api/export
 * @returns {Object} All schedules keyed by date (YYYY-MM-DD)
 *
 * @example
 * // Response structure
 * {
 *   "2025-12-14": [
 *     { "fetchedAt": "...", "scheduleDate": "14.12.2025", "groups": {...} },
 *     { "fetchedAt": "...", "scheduleDate": "14.12.2025", "groups": {...} }
 *   ],
 *   "2025-12-13": [...]
 * }
 *
 * @example
 * // Usage: Export and import to another instance
 * // curl https://source-instance/api/export > backup.json
 * // Then use import-data.js script to import
 */
app.get('/api/export', (req, res) => {
  const schedulesByDate = getAllSchedules();
  res.json(schedulesByDate);
});

/**
 * POST /api/schedule/import - Import a single schedule record.
 *
 * Imports a schedule record, typically used for restoring historical data
 * or transferring data between instances. The record is validated and stored
 * with duplicate detection.
 *
 * @name ImportSchedule
 * @route {POST} /api/schedule/import
 * @bodyparam {Object} record - Schedule record to import
 * @bodyparam {string} record.scheduleDate - Date in DD.MM.YYYY format (required)
 * @bodyparam {string} record.fetchedAt - ISO timestamp when originally fetched
 * @bodyparam {Object} record.groups - Group data (12 groups with intervals)
 * @returns {Object} Import result
 * @returns {boolean} response.imported - Whether the record was imported
 * @returns {string} response.dateKey - The date key where it was stored
 * @returns {string} [response.reason] - Reason if import was skipped
 * @throws {400} Invalid schedule record or missing scheduleDate
 *
 * @example
 * // Request body
 * {
 *   "scheduleDate": "14.12.2025",
 *   "fetchedAt": "2025-12-14T10:00:00.000Z",
 *   "infoTimestamp": "10:00 14.12.2025",
 *   "groups": {
 *     "1.1": {
 *       "intervalsText": "з 09:00 до 12:30",
 *       "intervals": [{ "start": "09:00", "end": "12:30", "durationMinutes": 210 }],
 *       "totalMinutesOff": 210
 *     }
 *     // ... all 12 groups
 *   }
 * }
 *
 * // Success response
 * { "imported": true, "dateKey": "2025-12-14" }
 *
 * // Duplicate response
 * { "imported": false, "reason": "duplicate", "dateKey": "2025-12-14" }
 */
app.post('/api/schedule/import', (req, res) => {
  const record = req.body;

  if (!record || !record.scheduleDate) {
    return res.status(400).json({ error: 'Invalid schedule record: missing scheduleDate' });
  }

  const result = importSchedule(record);

  if (result.imported) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

/**
 * DELETE /api/schedule/:dateKey/:fetchedAt - Delete a specific schedule version.
 *
 * Deletes a single schedule version identified by its date key and fetchedAt timestamp.
 * The fetchedAt parameter must be URL-encoded as it contains special characters.
 *
 * @name DeleteSchedule
 * @route {DELETE} /api/schedule/:dateKey/:fetchedAt
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @param {string} fetchedAt - URL-encoded ISO timestamp of the version to delete
 * @returns {Object} Deletion result
 * @returns {boolean} response.deleted - Whether deletion was successful
 * @returns {string} response.dateKey - The date key
 * @returns {string} response.fetchedAt - The timestamp of deleted version
 * @throws {400} Missing dateKey or fetchedAt
 * @throws {404} Schedule version not found
 *
 * @example
 * // DELETE /api/schedule/2025-12-14/2025-12-14T10%3A00%3A00.000Z
 * // Note: fetchedAt must be URL-encoded (: becomes %3A)
 *
 * // Success response
 * { "deleted": true, "dateKey": "2025-12-14", "fetchedAt": "2025-12-14T10:00:00.000Z" }
 *
 * // Not found response (404)
 * { "deleted": false, "error": "Schedule version not found" }
 */
app.delete('/api/schedule/:dateKey/:fetchedAt', (req, res) => {
  const { dateKey, fetchedAt } = req.params;

  if (!dateKey || !fetchedAt) {
    return res.status(400).json({ error: 'Missing dateKey or fetchedAt' });
  }

  const result = deleteSchedule(dateKey, decodeURIComponent(fetchedAt));

  if (result.deleted) {
    res.json(result);
  } else {
    res.status(404).json(result);
  }
});

/**
 * POST /api/fetch - Trigger an immediate schedule fetch.
 *
 * Manually triggers a fetch operation outside of the regular periodic schedule.
 * Returns 409 Conflict if a fetch is already in progress to prevent concurrent
 * fetches which could cause data inconsistencies.
 *
 * @name TriggerFetch
 * @route {POST} /api/fetch
 * @returns {Object} Fetch result
 * @returns {boolean} response.success - Whether fetch completed successfully
 * @returns {Object[]} response.schedules - Array of processed schedules
 * @returns {string} response.schedules[].date - Schedule date (DD.MM.YYYY)
 * @returns {boolean} response.schedules[].added - Whether schedule was new/changed
 * @returns {string} response.schedules[].reason - Why it was/wasn't added
 * @returns {boolean} response.schedules[].isNewDay - Whether this is first schedule for date
 * @throws {409} Fetch already in progress
 * @throws {500} Fetch failed (network error, parse error, etc.)
 *
 * @example
 * // Success response
 * {
 *   "success": true,
 *   "schedules": [
 *     { "date": "14.12.2025", "added": true, "reason": "changed", "isNewDay": false },
 *     { "date": "15.12.2025", "added": true, "reason": "new_day", "isNewDay": true }
 *   ]
 * }
 *
 * // Already fetching (409)
 * { "error": "Fetch already in progress" }
 */
app.post('/api/fetch', async (req, res) => {
  if (isFetching) {
    return res.status(409).json({ error: 'Fetch already in progress' });
  }

  try {
    const result = await performFetch();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /health - Health check endpoint for container orchestration.
 *
 * Simple health check endpoint that returns 200 OK when the server is running.
 * Used by Railway, Docker, and other orchestration platforms to verify the
 * application is healthy and ready to receive traffic.
 *
 * Note: The initial fetch is delayed by 5 seconds to ensure health checks
 * pass before the resource-intensive Puppeteer/Chromium launch occurs.
 *
 * @name HealthCheck
 * @route {GET} /health
 * @returns {Object} Health status
 * @returns {string} response.status - Always "ok" if server is running
 *
 * @example
 * // Response
 * { "status": "ok" }
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * GET /api/status - Get application status and Telegram bot statistics.
 *
 * Returns comprehensive status information about the application including
 * fetch state, timing information, and Telegram subscriber counts. Useful
 * for monitoring dashboards and debugging.
 *
 * @name GetStatus
 * @route {GET} /api/status
 * @returns {Object} Status response
 * @returns {string} response.version - Application version from VERSION file
 * @returns {string|null} response.lastFetchTime - ISO timestamp of last successful fetch
 * @returns {string|null} response.lastFetchError - Error message from last failed fetch
 * @returns {boolean} response.isFetching - Whether a fetch is currently in progress
 * @returns {number} response.fetchIntervalMs - Configured fetch interval in milliseconds
 * @returns {number} response.nextFetchIn - Milliseconds until next scheduled fetch
 * @returns {Object} response.telegram - Telegram bot status
 * @returns {boolean} response.telegram.enabled - Whether bot is configured
 * @returns {number} response.telegram.subscribers - Total subscriber count
 * @returns {Object} response.telegram.byGroup - Subscriber count per group
 *
 * @example
 * // Response
 * {
 *   "version": "1.2.3",
 *   "lastFetchTime": "2025-12-14T10:00:00.000Z",
 *   "lastFetchError": null,
 *   "isFetching": false,
 *   "fetchIntervalMs": 300000,
 *   "nextFetchIn": 180000,
 *   "telegram": {
 *     "enabled": true,
 *     "subscribers": 150,
 *     "byGroup": {
 *       "1.1": 25, "1.2": 18, "2.1": 12, ...
 *     }
 *   }
 * }
 */
app.get('/api/status', (req, res) => {
  res.json({
    version: VERSION,
    lastFetchTime,
    lastFetchError,
    isFetching,
    fetchIntervalMs: FETCH_INTERVAL_MS,
    nextFetchIn: lastFetchTime
      ? Math.max(0, FETCH_INTERVAL_MS - (Date.now() - new Date(lastFetchTime).getTime()))
      : 0,
    telegram: {
      enabled: !!TELEGRAM_BOT_TOKEN,
      subscribers: getSubscriberCount(),
      byGroup: getSubscribersByGroup()
    }
  });
});

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Performs a complete fetch cycle: scrape source website, parse schedules,
 * store changes, and notify Telegram subscribers.
 *
 * This is the core function that coordinates the entire data pipeline:
 * 1. Fetches HTML from source website using Puppeteer
 * 2. Parses Ukrainian text to extract schedule data
 * 3. Compares with existing data to detect changes
 * 4. Stores new/changed schedules to JSON files
 * 5. Sends Telegram notifications for affected groups
 *
 * The function is protected against concurrent execution via the `isFetching` flag.
 * If called while another fetch is in progress, it returns early with `skipped: true`.
 *
 * @async
 * @function performFetch
 * @returns {Promise<Object>} Fetch result
 * @returns {boolean} result.success - True if fetch completed successfully
 * @returns {boolean} [result.skipped] - True if fetch was skipped (already in progress)
 * @returns {string} [result.reason] - Reason for skipping
 * @returns {Object[]} [result.schedules] - Array of processed schedule results
 * @throws {Error} Propagates errors from fetcher, parser, or storage
 *
 * @example
 * // Successful fetch
 * const result = await performFetch();
 * // { success: true, schedules: [{ date: "14.12.2025", added: true, ... }] }
 *
 * @example
 * // Concurrent fetch attempt
 * const result = await performFetch();
 * // { skipped: true, reason: 'already_fetching' }
 *
 * @see fetchSchedulePage - Puppeteer-based web scraper
 * @see parseAllSchedules - Schedule text parser
 * @see addSchedule - Storage with duplicate detection
 * @see notifySubscribers - Telegram notification sender
 */
async function performFetch() {
  if (isFetching) return { skipped: true, reason: 'already_fetching' };

  isFetching = true;
  lastFetchError = null;

  try {
    console.log(`[${new Date().toISOString()}] Fetching schedule...`);

    const { text } = await fetchSchedulePage();
    const schedules = parseAllSchedules(text);

    console.log(`[${new Date().toISOString()}] Found ${schedules.length} schedule(s) on page`);

    const results = [];

    for (const schedule of schedules) {
      // Get previous schedule for this specific date before adding
      const { current: prevSchedule } = getLatestSchedules(getDateKey(schedule.scheduleDate));

      const result = addSchedule(schedule);
      results.push({
        date: schedule.scheduleDate,
        added: result.added,
        reason: result.reason,
        isNewDay: result.isNewDay
      });

      console.log(`  - ${schedule.scheduleDate}: added=${result.added}, isNewDay=${result.isNewDay}`);

      // If schedule was added (changed), notify subscribers
      if (result.added && TELEGRAM_BOT_TOKEN) {
        const { current: newSchedule } = getLatestSchedules(result.dateKey);
        notifySubscribers(prevSchedule, newSchedule, result.isNewDay).catch(err => {
          console.error('Error notifying subscribers:', err);
        });
      }
    }

    lastFetchTime = new Date().toISOString();
    console.log(`[${lastFetchTime}] Fetch complete.`);

    return { success: true, schedules: results };
  } catch (err) {
    lastFetchError = err.message;
    console.error(`[${new Date().toISOString()}] Fetch error:`, err.message);
    throw err;
  } finally {
    isFetching = false;
  }
}

/**
 * Converts a display date (DD.MM.YYYY) to a storage date key (YYYY-MM-DD).
 *
 * The source website uses European date format (DD.MM.YYYY) while the storage
 * uses ISO-like format (YYYY-MM-DD) for proper alphabetical sorting.
 *
 * @function getDateKey
 * @param {string|null} scheduleDate - Date in DD.MM.YYYY format (e.g., "14.12.2025")
 * @returns {string|null} Date key in YYYY-MM-DD format (e.g., "2025-12-14"), or null if input is null/undefined
 *
 * @example
 * getDateKey("14.12.2025")  // Returns "2025-12-14"
 * getDateKey("01.01.2026")  // Returns "2026-01-01"
 * getDateKey(null)          // Returns null
 */
function getDateKey(scheduleDate) {
  if (!scheduleDate) return null;
  const [day, month, year] = scheduleDate.split('.');
  return `${year}-${month}-${day}`;
}

/**
 * Starts the periodic fetch scheduler.
 *
 * Sets up automatic schedule fetching at regular intervals (FETCH_INTERVAL_MS).
 * The initial fetch is delayed by INITIAL_FETCH_DELAY (5 seconds) to ensure:
 * - Health check endpoints are available immediately
 * - Container orchestration platforms see the app as healthy
 * - The resource-intensive Puppeteer/Chromium launch doesn't block startup
 *
 * Timing behavior:
 * 1. Server starts → health check available immediately
 * 2. After 5 seconds → first fetch begins
 * 3. After first fetch completes → subsequent fetches every FETCH_INTERVAL_MS
 *
 * Error handling: Fetch errors are caught and logged but don't stop the scheduler.
 * The next fetch will still occur at the scheduled time.
 *
 * @function startPeriodicFetch
 * @returns {void}
 *
 * @example
 * // Called automatically on server startup
 * // Logs:
 * // "Periodic fetch scheduled every 300 seconds"
 * // "Initial fetch will start in 5 seconds..."
 */
function startPeriodicFetch() {
  /**
   * Delay before first fetch to ensure health checks pass.
   * @constant {number}
   */
  const INITIAL_FETCH_DELAY = 5000; // 5 seconds

  console.log(`Periodic fetch scheduled every ${FETCH_INTERVAL_MS / 1000} seconds`);
  console.log(`Initial fetch will start in ${INITIAL_FETCH_DELAY / 1000} seconds...`);

  setTimeout(() => {
    performFetch().catch(console.error);

    // Schedule periodic fetches after initial fetch
    setInterval(() => {
      performFetch().catch(console.error);
    }, FETCH_INTERVAL_MS);
  }, INITIAL_FETCH_DELAY);
}

// ============================================================================
// SPA FALLBACK & SERVER STARTUP
// ============================================================================

/**
 * SPA fallback route - serves index.html for all non-API routes.
 *
 * This enables Vue Router's history mode by serving the Vue SPA for any route
 * that doesn't match an API endpoint. The Vue Router then handles client-side
 * routing based on the URL path.
 *
 * Routes starting with /api/ are passed to the next middleware (404 handler).
 *
 * @name SPAFallback
 * @route {GET} *
 */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

/**
 * Server startup - initializes Express server and begins periodic fetching.
 *
 * On startup:
 * 1. Binds to PORT (default 3000)
 * 2. Logs startup information including version and Telegram status
 * 3. Starts the periodic fetch scheduler
 */
app.listen(PORT, () => {
  console.log(`LightTracker v${VERSION} running on http://localhost:${PORT}`);
  if (TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot enabled');
  } else {
    console.log('Telegram bot disabled (no token provided)');
  }
  startPeriodicFetch();
});
