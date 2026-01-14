/**
 * Grid Status History Storage
 *
 * Persists grid status changes with timestamps and schedule references.
 * Used to track power outages detected by EcoFlow device.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GRID_STATUS_FILE = path.join(DATA_DIR, 'grid-status.json');

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load grid status history from disk
 */
function loadGridStatusHistory() {
  ensureDataDir();
  if (!fs.existsSync(GRID_STATUS_FILE)) {
    return { history: [] };
  }
  try {
    const data = fs.readFileSync(GRID_STATUS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[GridStorage] Error loading history:', err.message);
    return { history: [] };
  }
}

/**
 * Save grid status history to disk
 */
function saveGridStatusHistory(data) {
  ensureDataDir();
  try {
    fs.writeFileSync(GRID_STATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[GridStorage] Error saving history:', err.message);
  }
}

/**
 * Add a new grid status record
 * @param {string} status - 'online' | 'offline' | 'unknown'
 * @param {object|null} scheduleRef - { dateKey, fetchedAt } of active schedule
 * @returns {object} The created record
 */
function addGridStatusRecord(status, scheduleRef) {
  const data = loadGridStatusHistory();

  const record = {
    timestamp: new Date().toISOString(),
    status,
    scheduleRef
  };

  data.history.push(record);
  saveGridStatusHistory(data);

  console.log(`[GridStorage] Recorded: ${status} at ${record.timestamp}`);
  return record;
}

/**
 * Get recent grid status history
 * @param {number} limit - Maximum number of records to return
 * @returns {Array} Recent history records (most recent last)
 */
function getRecentGridStatusHistory(limit = 50) {
  const data = loadGridStatusHistory();
  return data.history.slice(-limit);
}

/**
 * Get full grid status history
 * @returns {Array} All history records
 */
function getFullGridStatusHistory() {
  return loadGridStatusHistory().history;
}

/**
 * Add a manual grid status record with custom timestamp
 * @param {string} timestamp - ISO timestamp
 * @param {string} status - 'online' | 'offline'
 * @returns {object} The created record
 */
function addManualGridStatusRecord(timestamp, status) {
  const data = loadGridStatusHistory();

  const record = {
    timestamp,
    status,
    scheduleRef: null,
    manual: true
  };

  data.history.push(record);
  // Sort by timestamp
  data.history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  saveGridStatusHistory(data);

  console.log(`[GridStorage] Manual record: ${status} at ${timestamp}`);
  return record;
}

/**
 * Delete a grid status record by timestamp
 * @param {string} timestamp - ISO timestamp of record to delete
 * @returns {boolean} True if deleted, false if not found
 */
function deleteGridStatusRecord(timestamp) {
  const data = loadGridStatusHistory();
  const initialLength = data.history.length;

  data.history = data.history.filter(r => r.timestamp !== timestamp);

  if (data.history.length < initialLength) {
    saveGridStatusHistory(data);
    console.log(`[GridStorage] Deleted record at ${timestamp}`);
    return true;
  }
  return false;
}

module.exports = {
  addGridStatusRecord,
  addManualGridStatusRecord,
  deleteGridStatusRecord,
  getRecentGridStatusHistory,
  getFullGridStatusHistory
};
