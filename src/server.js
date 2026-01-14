const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { fetchSchedulePage } = require('./fetcher');
const { parseAllSchedules } = require('./parser');
const { addSchedule, getLatestSchedules, getAllDates, getSchedulesForDate, getAllSchedules, importSchedule, deleteSchedule } = require('./storage');
const { compareSchedules, buildDaySummary, calculateStatistics } = require('./comparator');
const { initTelegramBot, notifySubscribers, notifyEarlyPowerReturn, notifyGridOfflineEarly, notifyEmergencyOffline, getSubscriberCount, getSubscribersByGroup } = require('./telegram');
const { initEcoFlow, getGridStatus } = require('./ecoflow');
const { getRecentGridStatusHistory, getFullGridStatusHistory, addManualGridStatusRecord, deleteGridStatusRecord } = require('./grid-storage');

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

// EcoFlow group for early power return notifications
const ECOFLOW_GROUP = process.env.ECOFLOW_GROUP;

// Helper: Check if time is within interval
function isTimeInInterval(timeStr, interval) {
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const now = toMinutes(timeStr);
  const start = toMinutes(interval.start);
  const end = toMinutes(interval.end);
  return now >= start && now < end;
}

// Helper: Get current time as HH:MM in Ukraine timezone
function getCurrentTime() {
  const now = new Date();
  const kyivTime = now.toLocaleString('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return kyivTime;
}

// Callback for when grid comes back online
function handleGridOnline() {
  if (!ECOFLOW_GROUP) {
    console.log('[EcoFlow] No ECOFLOW_GROUP configured, skipping early return check');
    return;
  }

  const { current: schedule } = getLatestSchedules();
  if (!schedule || !schedule.groups[ECOFLOW_GROUP]) {
    console.log(`[EcoFlow] No schedule data for group ${ECOFLOW_GROUP}`);
    return;
  }

  const groupData = schedule.groups[ECOFLOW_GROUP];
  const currentTime = getCurrentTime();

  // Check if current time falls within any scheduled outage interval
  for (const interval of groupData.intervals) {
    if (isTimeInInterval(currentTime, interval)) {
      console.log(`[EcoFlow] Power returned early! Scheduled until ${interval.end}, now ${currentTime}`);
      if (TELEGRAM_BOT_TOKEN) {
        notifyEarlyPowerReturn(ECOFLOW_GROUP, interval.end, currentTime);
      }
      return;
    }
  }

  console.log('[EcoFlow] Power returned on schedule or outside outage window');
}

// Callback for when grid goes offline
function handleGridOffline() {
  if (!ECOFLOW_GROUP) {
    console.log('[EcoFlow] No ECOFLOW_GROUP configured, skipping offline check');
    return;
  }

  const { current: schedule } = getLatestSchedules();
  if (!schedule || !schedule.groups[ECOFLOW_GROUP]) {
    console.log(`[EcoFlow] No schedule data for group ${ECOFLOW_GROUP}`);
    return;
  }

  const groupData = schedule.groups[ECOFLOW_GROUP];
  const currentTime = getCurrentTime();

  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const nowMinutes = toMinutes(currentTime);

  // Check if we're within a scheduled outage (normal, don't notify)
  for (const interval of groupData.intervals) {
    if (isTimeInInterval(currentTime, interval)) {
      console.log(`[EcoFlow] Grid offline during scheduled outage (${interval.start}-${interval.end}), no notification`);
      return;
    }
  }

  // Check if we're within 30 minutes BEFORE any scheduled outage (early offline)
  const EARLY_WINDOW_MINUTES = 30;
  for (const interval of groupData.intervals) {
    const startMinutes = toMinutes(interval.start);
    const minutesBefore = startMinutes - nowMinutes;

    if (minutesBefore > 0 && minutesBefore <= EARLY_WINDOW_MINUTES) {
      console.log(`[EcoFlow] Grid offline ${minutesBefore} min before scheduled outage at ${interval.start}`);
      if (TELEGRAM_BOT_TOKEN) {
        notifyGridOfflineEarly(ECOFLOW_GROUP, interval.start, currentTime);
      }
      return;
    }
  }

  // Outside schedule entirely - emergency notification
  console.log(`[EcoFlow] EMERGENCY: Grid offline outside schedule at ${currentTime}`);
  if (TELEGRAM_BOT_TOKEN) {
    notifyEmergencyOffline(ECOFLOW_GROUP, currentTime);
  }
}

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

// API: Get grid status from EcoFlow RIVER 3
app.get('/api/grid-status', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    current: getGridStatus(),
    history: getRecentGridStatusHistory(limit)
  });
});

// API: Export full grid status history
app.get('/api/grid-status/export', (req, res) => {
  const history = getFullGridStatusHistory();
  res.json({
    exportedAt: new Date().toISOString(),
    recordCount: history.length,
    history
  });
});

// API: Add manual grid status record
app.post('/api/grid-status', (req, res) => {
  const { timestamp, status } = req.body;

  if (!timestamp || !status) {
    return res.status(400).json({ error: 'Missing timestamp or status' });
  }

  if (!['online', 'offline'].includes(status)) {
    return res.status(400).json({ error: 'Status must be online or offline' });
  }

  try {
    const record = addManualGridStatusRecord(timestamp, status);
    res.json({ success: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete grid status record
app.delete('/api/grid-status/:timestamp', (req, res) => {
  const timestamp = decodeURIComponent(req.params.timestamp);

  const deleted = deleteGridStatusRecord(timestamp);
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Record not found' });
  }
});

// API: System info and diagnostics
app.get('/api/system', (req, res) => {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

  // Calculate data file sizes
  const getFileSize = (filename) => {
    const filePath = path.join(dataDir, filename);
    try {
      return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    } catch { return 0; }
  };

  // Get schedule stats
  const schedules = getAllSchedules();
  const dateKeys = Object.keys(schedules);
  const totalRecords = dateKeys.reduce((sum, key) => sum + schedules[key].length, 0);

  // Get grid status stats
  const gridHistory = getFullGridStatusHistory();

  res.json({
    version: VERSION,
    uptime: process.uptime(),
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    dataStats: {
      scheduleDays: dateKeys.length,
      scheduleRecords: totalRecords,
      dateRange: dateKeys.length > 0 ? {
        oldest: dateKeys.sort()[0],
        newest: dateKeys.sort().reverse()[0]
      } : null,
      gridStatusRecords: gridHistory.length,
      telegramSubscribers: getSubscriberCount()
    },
    dataFiles: {
      'schedules.json': getFileSize('schedules.json'),
      'subscribers.json': getFileSize('subscribers.json'),
      'grid-status.json': getFileSize('grid-status.json')
    },
    config: {
      fetchIntervalMs: FETCH_INTERVAL_MS,
      telegramEnabled: !!TELEGRAM_BOT_TOKEN,
      ecoflowEnabled: !!(process.env.ECOFLOW_EMAIL && process.env.ECOFLOW_DEVICE_SN),
      ecoflowGroup: process.env.ECOFLOW_GROUP || null
    }
  });
});

// API: Download backup archive
app.get('/api/backup', (req, res) => {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `lighttracker-backup-${timestamp}.zip`;

  try {
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[Backup] Archive error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    });
    archive.pipe(res);

    const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

    // Add data files if they exist
    ['schedules.json', 'subscribers.json', 'grid-status.json'].forEach(file => {
      const filePath = path.join(dataDir, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
      }
    });

    // Add manifest
    const schedules = getAllSchedules();
    const dateKeys = Object.keys(schedules);
    const manifest = {
      exportedAt: new Date().toISOString(),
      version: VERSION,
      files: ['schedules.json', 'subscribers.json', 'grid-status.json'],
      stats: {
        scheduleDays: dateKeys.length,
        dateRange: dateKeys.length > 0 ? {
          from: dateKeys.sort()[0],
          to: dateKeys.sort().reverse()[0]
        } : null
      }
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    archive.finalize();
    console.log(`[Backup] Archive created: ${filename}`);
  } catch (err) {
    console.error('[Backup] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
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

app.listen(PORT, async () => {
  console.log(`LightTracker v${VERSION} running on http://localhost:${PORT}`);
  if (TELEGRAM_BOT_TOKEN) {
    console.log('Telegram bot enabled');
  } else {
    console.log('Telegram bot disabled (no token provided)');
  }

  // Initialize EcoFlow grid status monitoring (optional)
  await initEcoFlow(getLatestSchedules, handleGridOnline, handleGridOffline);

  startPeriodicFetch();
});
