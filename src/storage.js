const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

/**
 * Storage structure:
 * {
 *   "2025-12-01": [
 *     {
 *       fetchedAt: "2025-12-01T09:14:00Z",
 *       scheduleDate: "01.12.2025",
 *       infoTimestamp: "09:14 01.12.2025",
 *       groups: { ... }
 *     },
 *     ...
 *   ],
 *   ...
 * }
 */

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSchedules() {
  ensureDataDir();
  if (!fs.existsSync(SCHEDULES_FILE)) {
    return {};
  }
  try {
    const data = fs.readFileSync(SCHEDULES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading schedules:', err);
    return {};
  }
}

function saveSchedules(schedules) {
  ensureDataDir();
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
}

function getDateKey(scheduleDate) {
  // Convert "01.12.2025" to "2025-12-01"
  if (!scheduleDate) return null;
  const [day, month, year] = scheduleDate.split('.');
  return `${year}-${month}-${day}`;
}

function schedulesAreEqual(schedule1, schedule2) {
  if (!schedule1 || !schedule2) return false;

  const groups1 = Object.keys(schedule1.groups).sort();
  const groups2 = Object.keys(schedule2.groups).sort();

  if (groups1.length !== groups2.length) return false;
  if (groups1.join(',') !== groups2.join(',')) return false;

  for (const groupId of groups1) {
    const g1 = schedule1.groups[groupId];
    const g2 = schedule2.groups[groupId];

    if (g1.intervalsText !== g2.intervalsText) return false;
  }

  return true;
}

function addSchedule(schedule) {
  const schedules = loadSchedules();
  const dateKey = getDateKey(schedule.scheduleDate);

  if (!dateKey) {
    console.error('Invalid schedule date');
    return { added: false, reason: 'invalid_date' };
  }

  // Check if this is a new day (first schedule for this date)
  const isNewDay = !schedules[dateKey] || schedules[dateKey].length === 0;

  if (!schedules[dateKey]) {
    schedules[dateKey] = [];
  }

  const daySchedules = schedules[dateKey];
  const latestSchedule = daySchedules[daySchedules.length - 1];

  // Only add if different from the latest
  if (schedulesAreEqual(latestSchedule, schedule)) {
    return { added: false, reason: 'no_change', isNewDay: false };
  }

  const record = {
    fetchedAt: new Date().toISOString(),
    scheduleDate: schedule.scheduleDate,
    infoTimestamp: schedule.infoTimestamp,
    groups: schedule.groups
  };

  schedules[dateKey].push(record);
  saveSchedules(schedules);

  return { added: true, record, isNewDay, dateKey };
}

function getLatestSchedules(dateKey = null, preferToday = false) {
  const schedules = loadSchedules();

  if (dateKey && schedules[dateKey]) {
    const daySchedules = schedules[dateKey];
    return {
      dateKey,
      current: daySchedules[daySchedules.length - 1] || null,
      previous: daySchedules[daySchedules.length - 2] || null,
      allForDay: daySchedules
    };
  }

  // Get all date keys, sorted descending
  const dateKeys = Object.keys(schedules).sort().reverse();

  if (dateKeys.length === 0) {
    return { current: null, previous: null, allForDay: [], dateKey: null };
  }

  // If preferToday is true, try to get today's schedule (Kyiv timezone)
  if (preferToday) {
    const todayKyiv = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' }); // YYYY-MM-DD
    if (schedules[todayKyiv]) {
      const daySchedules = schedules[todayKyiv];
      return {
        dateKey: todayKyiv,
        current: daySchedules[daySchedules.length - 1] || null,
        previous: daySchedules[daySchedules.length - 2] || null,
        allForDay: daySchedules
      };
    }
  }

  // Fall back to latest date
  const latestDateKey = dateKeys[0];
  const daySchedules = schedules[latestDateKey];

  return {
    dateKey: latestDateKey,
    current: daySchedules[daySchedules.length - 1] || null,
    previous: daySchedules[daySchedules.length - 2] || null,
    allForDay: daySchedules
  };
}

function getAllDates() {
  const schedules = loadSchedules();
  return Object.keys(schedules).sort().reverse();
}

function getSchedulesForDate(dateKey) {
  const schedules = loadSchedules();
  return schedules[dateKey] || [];
}

// Alias for loadSchedules for semantic clarity
function getAllSchedules() {
  return loadSchedules();
}

/**
 * Import a schedule record directly (for historical data import)
 * Unlike addSchedule, this preserves the original fetchedAt timestamp
 * and doesn't skip duplicates - caller is responsible for data integrity
 */
function importSchedule(record) {
  const schedules = loadSchedules();
  const dateKey = getDateKey(record.scheduleDate);

  if (!dateKey) {
    return { imported: false, reason: 'invalid_date' };
  }

  if (!record.fetchedAt || !record.groups) {
    return { imported: false, reason: 'missing_required_fields' };
  }

  if (!schedules[dateKey]) {
    schedules[dateKey] = [];
  }

  // Check for exact duplicate (same fetchedAt)
  const exists = schedules[dateKey].some(s => s.fetchedAt === record.fetchedAt);
  if (exists) {
    return { imported: false, reason: 'duplicate', dateKey };
  }

  schedules[dateKey].push(record);

  // Sort by fetchedAt to maintain chronological order
  schedules[dateKey].sort((a, b) => new Date(a.fetchedAt) - new Date(b.fetchedAt));

  saveSchedules(schedules);

  return { imported: true, dateKey };
}

/**
 * Delete a specific schedule by dateKey and fetchedAt timestamp
 */
function deleteSchedule(dateKey, fetchedAt) {
  const schedules = loadSchedules();

  if (!schedules[dateKey]) {
    return { deleted: false, reason: 'date_not_found' };
  }

  const initialLength = schedules[dateKey].length;
  schedules[dateKey] = schedules[dateKey].filter(s => s.fetchedAt !== fetchedAt);

  if (schedules[dateKey].length === initialLength) {
    return { deleted: false, reason: 'schedule_not_found' };
  }

  // Remove empty date keys
  if (schedules[dateKey].length === 0) {
    delete schedules[dateKey];
  }

  saveSchedules(schedules);

  return { deleted: true, dateKey, fetchedAt };
}

module.exports = {
  addSchedule,
  getLatestSchedules,
  getAllDates,
  getSchedulesForDate,
  loadSchedules,
  getAllSchedules,
  importSchedule,
  deleteSchedule
};
