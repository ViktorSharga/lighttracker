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

module.exports = { compareSchedules, getChangeIcon, buildDaySummary };
