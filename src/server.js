const express = require('express');
const path = require('path');
const fs = require('fs');
const { fetchSchedulePage } = require('./fetcher');
const { parseAllSchedules } = require('./parser');
const { addSchedule, getLatestSchedules, getAllDates, getSchedulesForDate, getAllSchedules, importSchedule, deleteSchedule } = require('./storage');
const { compareSchedules, buildDaySummary, calculateStatistics } = require('./comparator');
const { initTelegramBot, notifySubscribers, getSubscriberCount, getSubscribersByGroup } = require('./telegram');

// All possible groups
const ALL_GROUPS = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];

const app = express();
const PORT = process.env.PORT || 3000;
const FETCH_INTERVAL_MS = parseInt(process.env.FETCH_INTERVAL_MS) || 300000; // 5 minutes
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Read version
const VERSION = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();

// State
let lastFetchTime = null;
let lastFetchError = null;
let isFetching = false;

// Initialize Telegram bot
initTelegramBot(TELEGRAM_BOT_TOKEN, getLatestSchedules);

// Parse JSON bodies
app.use(express.json());

// Serve Vue frontend
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// API: Get current schedule and comparison
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

// API: Get all available dates
app.get('/api/dates', (req, res) => {
  const dates = getAllDates();
  res.json({ dates });
});

// API: Get schedules for a specific date
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

// API: Get day history summary
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

// API: Get statistics
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

// API: Export all schedules (for data transfer between instances)
app.get('/api/export', (req, res) => {
  const schedulesByDate = getAllSchedules();
  res.json(schedulesByDate);
});

// API: Import a single schedule (for historical data)
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

// API: Delete a specific schedule
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

// API: Force fetch
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

// Health check endpoint for Railway/container orchestration
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API: Get status
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

async function performFetch() {
  if (isFetching) return { skipped: true, reason: 'already_fetching' };

  isFetching = true;
  lastFetchError = null;

  const { dateKey: todayKey, scheduleDate: todayScheduleDate } = getTodayDates();

  try {
    console.log(`[${new Date().toISOString()}] Fetching schedule...`);

    const { text, noOutages } = await fetchSchedulePage();

    // If source explicitly has no outages (page loaded but no schedule data)
    if (noOutages) {
      console.log(`[${new Date().toISOString()}] Source indicates no outages scheduled`);
      const noOutagesResult = await ensureTodayHasSchedule(todayKey, todayScheduleDate);
      lastFetchTime = new Date().toISOString();
      return {
        success: true,
        schedules: noOutagesResult ? [noOutagesResult] : [],
        noOutages: true
      };
    }

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

    // Check if we found a schedule for today
    const hasTodayScheduleFromSource = schedules.some(
      s => getDateKey(s.scheduleDate) === todayKey
    );

    // If no schedule for today from source, check if we need to create a "no outages" schedule
    if (!hasTodayScheduleFromSource) {
      const noOutagesResult = await ensureTodayHasSchedule(todayKey, todayScheduleDate, results);
      if (noOutagesResult) {
        results.push(noOutagesResult);
      }
    }

    lastFetchTime = new Date().toISOString();
    console.log(`[${lastFetchTime}] Fetch complete.`);

    return { success: true, schedules: results };
  } catch (err) {
    lastFetchError = err.message;
    console.error(`[${new Date().toISOString()}] Fetch error:`, err.message);

    // Even if fetch fails, ensure today has a schedule (no outages = good day!)
    try {
      const noOutagesResult = await ensureTodayHasSchedule(todayKey, todayScheduleDate);
      if (noOutagesResult) {
        console.log(`[${new Date().toISOString()}] Created no-outages schedule despite fetch error`);
      }
    } catch (noOutagesErr) {
      console.error('Error creating no-outages schedule:', noOutagesErr.message);
    }

    throw err;
  } finally {
    isFetching = false;
  }
}

// Ensure today has a schedule - create "no outages" schedule if none exists
async function ensureTodayHasSchedule(todayKey, todayScheduleDate, results = []) {
  const existingSchedules = getSchedulesForDate(todayKey);

  if (existingSchedules.length > 0) {
    console.log(`[${new Date().toISOString()}] Today (${todayKey}) already has ${existingSchedules.length} schedule(s), skipping no-outages creation`);
    return null;
  }

  console.log(`[${new Date().toISOString()}] No schedule found for today (${todayKey}), creating no-outages schedule`);

  const noOutagesSchedule = createNoOutagesSchedule(todayScheduleDate);

  // Get previous schedule (from yesterday or earlier) for notifications
  const { current: prevSchedule } = getLatestSchedules();

  const result = addSchedule(noOutagesSchedule);

  if (result.added) {
    console.log(`  - ${todayScheduleDate}: added=${result.added}, isNewDay=${result.isNewDay}, isNoOutages=true`);

    // Notify subscribers about the no-outages day
    if (TELEGRAM_BOT_TOKEN) {
      const { current: newSchedule } = getLatestSchedules(result.dateKey);
      notifySubscribers(prevSchedule, newSchedule, result.isNewDay).catch(err => {
        console.error('Error notifying subscribers about no-outages schedule:', err);
      });
    }

    return {
      date: todayScheduleDate,
      added: result.added,
      reason: result.reason,
      isNewDay: result.isNewDay,
      isNoOutagesSchedule: true
    };
  }

  return null;
}

// Helper to get date key from schedule date
function getDateKey(scheduleDate) {
  if (!scheduleDate) return null;
  const [day, month, year] = scheduleDate.split('.');
  return `${year}-${month}-${day}`;
}

// Get today's date in both formats used by the app
function getTodayDates() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();

  return {
    dateKey: `${year}-${month}-${day}`,        // YYYY-MM-DD (storage key)
    scheduleDate: `${day}.${month}.${year}`    // DD.MM.YYYY (display format)
  };
}

// Create a schedule with no outages for all groups (100% light)
function createNoOutagesSchedule(scheduleDate) {
  const groups = {};
  for (const groupId of ALL_GROUPS) {
    groups[groupId] = {
      intervalsText: '',
      intervals: [],
      totalMinutesOff: 0
    };
  }

  return {
    scheduleDate,
    infoTimestamp: new Date().toISOString(),
    groups,
    isNoOutagesSchedule: true  // Flag to identify auto-generated schedules
  };
}

// Start periodic fetching
function startPeriodicFetch() {
  // Delay initial fetch to allow health checks to pass first
  // Puppeteer/Chromium launch is resource-intensive and can block the event loop
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

// SPA fallback - serve index.html for all non-API routes (Vue Router)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`LightTracker v${VERSION} running on http://localhost:${PORT}`);
  if (TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot enabled');
  } else {
    console.log('Telegram bot disabled (no token provided)');
  }
  startPeriodicFetch();
});
