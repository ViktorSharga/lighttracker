/**
 * Parse the schedule text from poweron.loe.lviv.ua
 *
 * Expected format (may contain multiple schedules):
 * Графік погодинних відключень на 01.12.2025
 * Інформація станом на 09:14 01.12.2025
 *
 * Група 1.1. Електроенергії немає з 10:30 до 12:30, з 19:30 до 22:00.
 * Група 1.2. Електроенергії немає з 09:00 до 10:30, з 19:30 до 22:00.
 * ...
 *
 * Графік погодинних відключень на 02.12.2025
 * Інформація станом на 19:29 01.12.2025
 * ...
 */

/**
 * Parse all schedules from the page text
 * Returns an array of schedule objects
 */
function parseAllSchedules(text) {
  const schedules = [];

  // Split text by schedule headers
  const schedulePattern = /Графік погодинних відключень на (\d{2}\.\d{2}\.\d{4})/g;
  const matches = [...text.matchAll(schedulePattern)];

  if (matches.length === 0) {
    return schedules;
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const scheduleDate = match[1];
    const startIndex = match.index;

    // Find the end of this schedule (start of next schedule or end of relevant content)
    let endIndex;
    if (i + 1 < matches.length) {
      endIndex = matches[i + 1].index;
    } else {
      // Find end marker - usually before "З архівом графіків" or similar footer
      const footerMatch = text.indexOf('З архівом графіків', startIndex);
      endIndex = footerMatch > 0 ? footerMatch : text.length;
    }

    const scheduleText = text.substring(startIndex, endIndex);
    const schedule = parseSingleSchedule(scheduleText, scheduleDate);

    if (schedule && Object.keys(schedule.groups).length > 0) {
      schedules.push(schedule);
    }
  }

  return schedules;
}

// All possible groups
const ALL_GROUPS = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];

/**
 * Parse a single schedule section
 */
function parseSingleSchedule(text, scheduleDate) {
  const result = {
    scheduleDate: scheduleDate,
    infoTimestamp: null,
    groups: {},
    rawText: text
  };

  // Extract info timestamp: "Інформація станом на 09:14 01.12.2025"
  const infoTimestampMatch = text.match(/Інформація станом на (\d{2}:\d{2}) (\d{2}\.\d{2}\.\d{4})/);
  if (infoTimestampMatch) {
    result.infoTimestamp = `${infoTimestampMatch[1]} ${infoTimestampMatch[2]}`;
  }

  // Initialize all groups with no outages
  for (const groupId of ALL_GROUPS) {
    result.groups[groupId] = {
      intervalsText: '',
      intervals: [],
      totalMinutesOff: 0
    };
  }

  // Extract groups with outages: "Група X.Y. Електроенергії немає з HH:MM до HH:MM, з HH:MM до HH:MM."
  const groupPattern = /Група (\d+\.\d+)\.\s*Електроенергії немає\s+(.+?)(?=Група|\n\n|$)/g;
  let match;

  while ((match = groupPattern.exec(text)) !== null) {
    const groupId = match[1];
    const intervalsText = match[2].trim();

    // Parse intervals: "з 10:30 до 12:30, з 19:30 до 22:00"
    const intervals = parseIntervals(intervalsText);

    result.groups[groupId] = {
      intervalsText: intervalsText.replace(/\.$/, ''),
      intervals: intervals,
      totalMinutesOff: calculateTotalMinutes(intervals)
    };
  }

  return result;
}

/**
 * Legacy function - parses only the first schedule
 * Kept for backward compatibility
 */
function parseScheduleText(text) {
  const schedules = parseAllSchedules(text);
  return schedules.length > 0 ? schedules[0] : {
    scheduleDate: null,
    infoTimestamp: null,
    groups: {},
    rawText: text
  };
}

function parseIntervals(text) {
  const intervals = [];
  const intervalPattern = /з (\d{2}:\d{2}) до (\d{2}:\d{2})/g;
  let match;

  while ((match = intervalPattern.exec(text)) !== null) {
    const start = match[1];
    const end = match[2];
    intervals.push({
      start,
      end,
      durationMinutes: calculateDuration(start, end)
    });
  }

  return intervals;
}

function calculateDuration(start, end) {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  // Handle overnight intervals (e.g., 22:00 to 24:00)
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

function calculateTotalMinutes(intervals) {
  return intervals.reduce((sum, interval) => sum + interval.durationMinutes, 0);
}

function formatMinutes(minutes) {
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '+';

  if (hours === 0) {
    return `${sign}${mins} хв`;
  } else if (mins === 0) {
    return `${sign}${hours} год`;
  }
  return `${sign}${hours} год ${mins} хв`;
}

module.exports = { parseScheduleText, parseAllSchedules, formatMinutes, calculateTotalMinutes };
