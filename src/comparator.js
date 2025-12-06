const { formatMinutes } = require('./parser');

/**
 * Compare two schedules and return detailed change information
 */
function compareSchedules(current, previous) {
  if (!current || !previous) {
    return null;
  }

  const changes = {
    hasChanges: false,
    groupChanges: {},
    summary: {
      totalMinutesChange: 0,
      groupsWithMoreOutage: 0,
      groupsWithLessOutage: 0,
      groupsUnchanged: 0,
      averageChangePerGroup: 0,
      overallImpactPercent: 0
    }
  };

  const allGroups = new Set([
    ...Object.keys(current.groups),
    ...Object.keys(previous.groups)
  ]);

  let totalChange = 0;
  let groupCount = 0;

  for (const groupId of allGroups) {
    const currGroup = current.groups[groupId];
    const prevGroup = previous.groups[groupId];

    const currMinutes = currGroup?.totalMinutesOff || 0;
    const prevMinutes = prevGroup?.totalMinutesOff || 0;
    const diff = currMinutes - prevMinutes;

    const groupChange = {
      groupId,
      currentMinutesOff: currMinutes,
      previousMinutesOff: prevMinutes,
      differenceMinutes: diff,
      differenceFormatted: formatMinutes(diff),
      currentIntervals: currGroup?.intervalsText || 'немає даних',
      previousIntervals: prevGroup?.intervalsText || 'немає даних',
      status: diff > 0 ? 'worse' : diff < 0 ? 'better' : 'unchanged'
    };

    if (diff !== 0) {
      changes.hasChanges = true;
    }

    if (diff > 0) {
      changes.summary.groupsWithMoreOutage++;
    } else if (diff < 0) {
      changes.summary.groupsWithLessOutage++;
    } else {
      changes.summary.groupsUnchanged++;
    }

    totalChange += diff;
    groupCount++;
    changes.groupChanges[groupId] = groupChange;
  }

  changes.summary.totalMinutesChange = totalChange;
  changes.summary.totalChangeFormatted = formatMinutes(totalChange);
  changes.summary.averageChangePerGroup = groupCount > 0
    ? Math.round(totalChange / groupCount)
    : 0;
  changes.summary.averageChangeFormatted = formatMinutes(changes.summary.averageChangePerGroup);

  // Calculate overall impact as percentage
  // Assuming all groups represent equal portions of users (100% / number of groups)
  // Total possible minutes in a day per group = 24 * 60 = 1440
  const totalPossibleMinutes = groupCount * 24 * 60;
  if (totalPossibleMinutes > 0) {
    changes.summary.overallImpactPercent = ((totalChange / totalPossibleMinutes) * 100).toFixed(2);
  }

  // Human-readable summary
  if (changes.hasChanges) {
    const direction = totalChange > 0 ? 'більше' : 'менше';
    const absTotal = Math.abs(totalChange);
    const hours = Math.floor(absTotal / 60);
    const mins = absTotal % 60;

    let timeStr = '';
    if (hours > 0 && mins > 0) {
      timeStr = `${hours} год ${mins} хв`;
    } else if (hours > 0) {
      timeStr = `${hours} год`;
    } else {
      timeStr = `${mins} хв`;
    }

    changes.summary.humanReadable = `Загалом ${timeStr} ${direction} без світла (по всіх групах)`;
  } else {
    changes.summary.humanReadable = 'Без змін';
  }

  return changes;
}

/**
 * Get a simple status indicator for a group change
 */
function getChangeIcon(differenceMinutes) {
  if (differenceMinutes > 0) return '🔴'; // More outage - worse
  if (differenceMinutes < 0) return '🟢'; // Less outage - better
  return '⚪'; // No change
}

/**
 * Build a summary of all changes for a day
 */
function buildDaySummary(schedules) {
  if (!schedules || schedules.length === 0) {
    return null;
  }

  const summary = {
    updateCount: schedules.length,
    firstUpdate: schedules[0].infoTimestamp,
    lastUpdate: schedules[schedules.length - 1].infoTimestamp,
    totalChanges: 0,
    changesTimeline: [],
    groupSummaries: {}
  };

  // Initialize group summaries from first schedule
  const allGroups = new Set();
  schedules.forEach(s => Object.keys(s.groups).forEach(g => allGroups.add(g)));

  for (const groupId of allGroups) {
    summary.groupSummaries[groupId] = {
      changes: [],
      totalChange: 0,
      initialMinutes: schedules[0].groups[groupId]?.totalMinutesOff || 0,
      finalMinutes: schedules[schedules.length - 1].groups[groupId]?.totalMinutesOff || 0
    };
  }

  // Build timeline of changes
  for (let i = 1; i < schedules.length; i++) {
    const prev = schedules[i - 1];
    const curr = schedules[i];
    const comparison = compareSchedules(curr, prev);

    if (comparison && comparison.hasChanges) {
      summary.totalChanges++;

      const changeEntry = {
        fromTimestamp: prev.infoTimestamp,
        toTimestamp: curr.infoTimestamp,
        summary: comparison.summary,
        groupChanges: {}
      };

      for (const [groupId, change] of Object.entries(comparison.groupChanges)) {
        if (change.differenceMinutes !== 0) {
          changeEntry.groupChanges[groupId] = {
            diff: change.differenceMinutes,
            diffFormatted: change.differenceFormatted,
            from: change.previousIntervals,
            to: change.currentIntervals,
            status: change.status
          };

          summary.groupSummaries[groupId].changes.push({
            timestamp: curr.infoTimestamp,
            diff: change.differenceMinutes,
            diffFormatted: change.differenceFormatted,
            from: change.previousIntervals,
            to: change.currentIntervals
          });
          summary.groupSummaries[groupId].totalChange += change.differenceMinutes;
        }
      }

      summary.changesTimeline.push(changeEntry);
    }
  }

  // Calculate final change for each group
  for (const groupId of allGroups) {
    const gs = summary.groupSummaries[groupId];
    gs.netChange = gs.finalMinutes - gs.initialMinutes;
    gs.netChangeFormatted = formatMinutes(gs.netChange);
    gs.changeCount = gs.changes.length;
  }

  return summary;
}

/**
 * Calculate statistics across multiple days
 * @param {Object} schedulesByDate - Object with date keys (YYYY-MM-DD) and arrays of schedules
 * @param {string} fromDate - Optional start date (YYYY-MM-DD)
 * @param {string} toDate - Optional end date (YYYY-MM-DD)
 */
function calculateStatistics(schedulesByDate, fromDate = null, toDate = null) {
  const dates = Object.keys(schedulesByDate).sort();

  // Filter dates by range if specified
  const filteredDates = dates.filter(date => {
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });

  if (filteredDates.length === 0) {
    return {
      dailyStats: [],
      groupComparison: {},
      summary: {
        totalDays: 0,
        overallAverageOutage: 0,
        bestDay: null,
        worstDay: null
      }
    };
  }

  const dailyStats = [];
  const groupTotals = {}; // Track totals for each group across all days
  const allGroups = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];

  // Initialize group totals
  allGroups.forEach(g => {
    groupTotals[g] = { totalMinutes: 0, daysCount: 0 };
  });

  for (const date of filteredDates) {
    const daySchedules = schedulesByDate[date];
    if (!daySchedules || daySchedules.length === 0) continue;

    // Get the LATEST schedule for this day (final version)
    const latestSchedule = daySchedules[daySchedules.length - 1];
    const groups = latestSchedule.groups || {};

    let totalOutageMinutes = 0;
    let groupCount = 0;

    for (const groupId of allGroups) {
      const groupData = groups[groupId];
      const minutesOff = groupData?.totalMinutesOff || 0;
      totalOutageMinutes += minutesOff;
      groupCount++;

      // Accumulate for group comparison
      groupTotals[groupId].totalMinutes += minutesOff;
      groupTotals[groupId].daysCount++;
    }

    const averageOutageMinutes = groupCount > 0 ? Math.round(totalOutageMinutes / groupCount) : 0;
    const percentWithPower = ((1440 - averageOutageMinutes) / 1440 * 100).toFixed(1);
    const hoursWithPower = ((1440 - averageOutageMinutes) / 60).toFixed(1);

    dailyStats.push({
      date,
      scheduleDate: latestSchedule.scheduleDate,
      totalOutageMinutes,
      averageOutageMinutes,
      percentWithPower: parseFloat(percentWithPower),
      hoursWithPower: parseFloat(hoursWithPower),
      hoursWithoutPower: (averageOutageMinutes / 60).toFixed(1)
    });
  }

  // Build group comparison
  const groupComparison = {};
  const groupAverages = [];

  for (const groupId of allGroups) {
    const gt = groupTotals[groupId];
    const avgMinutes = gt.daysCount > 0 ? Math.round(gt.totalMinutes / gt.daysCount) : 0;
    groupComparison[groupId] = {
      totalMinutes: gt.totalMinutes,
      averageMinutes: avgMinutes,
      daysCount: gt.daysCount,
      rank: 0 // Will be set below
    };
    groupAverages.push({ groupId, avgMinutes });
  }

  // Rank groups (1 = least outage, best)
  groupAverages.sort((a, b) => a.avgMinutes - b.avgMinutes);
  groupAverages.forEach((item, idx) => {
    groupComparison[item.groupId].rank = idx + 1;
  });

  // Calculate summary
  let bestDay = null;
  let worstDay = null;
  let totalAvgOutage = 0;

  dailyStats.forEach(day => {
    totalAvgOutage += day.averageOutageMinutes;
    if (!bestDay || day.averageOutageMinutes < bestDay.avgMinutes) {
      bestDay = { date: day.date, avgMinutes: day.averageOutageMinutes };
    }
    if (!worstDay || day.averageOutageMinutes > worstDay.avgMinutes) {
      worstDay = { date: day.date, avgMinutes: day.averageOutageMinutes };
    }
  });

  const overallAverageOutage = dailyStats.length > 0
    ? Math.round(totalAvgOutage / dailyStats.length)
    : 0;

  return {
    dailyStats,
    groupComparison,
    summary: {
      totalDays: dailyStats.length,
      overallAverageOutage,
      overallAverageFormatted: formatMinutesToHuman(overallAverageOutage),
      bestDay: bestDay ? {
        date: bestDay.date,
        avgMinutes: bestDay.avgMinutes,
        formatted: formatMinutesToHuman(bestDay.avgMinutes)
      } : null,
      worstDay: worstDay ? {
        date: worstDay.date,
        avgMinutes: worstDay.avgMinutes,
        formatted: formatMinutesToHuman(worstDay.avgMinutes)
      } : null
    }
  };
}

/**
 * Format minutes to human-readable string (e.g., "3 год 20 хв")
 */
function formatMinutesToHuman(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} год ${m} хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
}

module.exports = { compareSchedules, getChangeIcon, buildDaySummary, calculateStatistics };
