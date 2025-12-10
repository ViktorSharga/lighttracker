const express = require('express');
const path = require('path');
const fs = require('fs');
const { fetchSchedulePage } = require('./fetcher');
const { parseAllSchedules } = require('./parser');
const { addSchedule, getLatestSchedules, getAllDates, getSchedulesForDate, getAllSchedules, importSchedule, deleteSchedule } = require('./storage');
const { compareSchedules, buildDaySummary, calculateStatistics } = require('./comparator');
const { initTelegramBot, notifySubscribers, getSubscriberCount, getSubscribersByGroup } = require('./telegram');

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

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

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
  const { from, to } = req.query;
  const schedulesByDate = getAllSchedules();

  const statistics = calculateStatistics(schedulesByDate, from || null, to || null);

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

// Helper to get date key from schedule date
function getDateKey(scheduleDate) {
  if (!scheduleDate) return null;
  const [day, month, year] = scheduleDate.split('.');
  return `${year}-${month}-${day}`;
}

// Start periodic fetching
function startPeriodicFetch() {
  // Initial fetch
  performFetch().catch(console.error);

  // Schedule periodic fetches
  setInterval(() => {
    performFetch().catch(console.error);
  }, FETCH_INTERVAL_MS);

  console.log(`Periodic fetch scheduled every ${FETCH_INTERVAL_MS / 1000} seconds`);
}

app.listen(PORT, () => {
  console.log(`LightTracker v${VERSION} running on http://localhost:${PORT}`);
  if (TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot enabled');
  } else {
    console.log('Telegram bot disabled (no token provided)');
  }
  startPeriodicFetch();
});
