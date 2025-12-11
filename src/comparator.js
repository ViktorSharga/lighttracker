const { formatMinutes } = require('./parser');

// ============================================
// TIME-OF-DAY IMPACT ANALYSIS CONSTANTS
// ============================================

/**
 * Time slot weights based on real-world impact
 * Higher weight = more disruptive outage
 */
const TIME_SLOT_WEIGHTS = {
  night:       { start: 0,  end: 6,  weight: 0.3, label: 'Ніч',          color: '#6366f1' },
  morning:     { start: 6,  end: 9,  weight: 1.0, label: 'Ранок',        color: '#f59e0b' },
  daytime:     { start: 9,  end: 17, weight: 0.8, label: 'Денний час',   color: '#3b82f6' },
  primeTime:   { start: 17, end: 22, weight: 1.5, label: 'Вечір',        color: '#ef4444' },
  lateEvening: { start: 22, end: 24, weight: 0.5, label: 'Пізній вечір', color: '#8b5cf6' }
};

const ALL_GROUPS = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];

// ============================================
// TIME-OF-DAY HELPER FUNCTIONS
// ============================================

/**
 * Get weight for a specific hour (0-23)
 */
function getHourWeight(hour) {
  for (const slot of Object.values(TIME_SLOT_WEIGHTS)) {
    if (hour >= slot.start && hour < slot.end) {
      return slot.weight;
    }
  }
  return 1.0; // fallback
}

/**
 * Get time slot name for a specific hour (0-23)
 */
function getTimeSlotForHour(hour) {
  for (const [slotName, slot] of Object.entries(TIME_SLOT_WEIGHTS)) {
    if (hour >= slot.start && hour < slot.end) {
      return slotName;
    }
  }
  return 'daytime'; // fallback
}

/**
 * Calculate weighted minutes for a single interval
 * Handles intervals that span multiple time slots
 */
function calculateWeightedMinutes(interval) {
  const { start, end } = interval;
  const startHour = parseInt(start.split(':')[0]);
  const startMin = parseInt(start.split(':')[1]);
  const endHour = parseInt(end.split(':')[0]);
  const endMin = parseInt(end.split(':')[1]);

  let weightedTotal = 0;
  let currentHour = startHour;
  let currentMin = startMin;

  // Handle same hour case
  if (startHour === endHour) {
    const weight = getHourWeight(currentHour);
    return (endMin - startMin) * weight;
  }

  // Process hour by hour
  while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
    const weight = getHourWeight(currentHour);
    let minutesInThisHour;

    if (currentHour === startHour) {
      // First hour: from startMin to 60
      minutesInThisHour = 60 - currentMin;
    } else if (currentHour === endHour) {
      // Last hour: from 0 to endMin
      minutesInThisHour = endMin;
    } else {
      // Full hour
      minutesInThisHour = 60;
    }

    weightedTotal += minutesInThisHour * weight;
    currentHour++;
    currentMin = 0;

    // Safety check to prevent infinite loop
    if (currentHour > 24) break;
  }

  return weightedTotal;
}

/**
 * Calculate per-hour outage minutes for heatmap data
 * Returns array of 24 elements, one for each hour
 */
function calculateHourlyOutageMinutes(intervals) {
  const hourlyMinutes = new Array(24).fill(0);

  for (const interval of intervals) {
    const startHour = parseInt(interval.start.split(':')[0]);
    const startMin = parseInt(interval.start.split(':')[1]);
    const endHour = parseInt(interval.end.split(':')[0]);
    const endMin = parseInt(interval.end.split(':')[1]);

    for (let h = startHour; h <= endHour && h < 24; h++) {
      let minutes;
      if (h === startHour && h === endHour) {
        // Same hour: exact duration
        minutes = endMin - startMin;
      } else if (h === startHour) {
        // First hour: from startMin to 60
        minutes = 60 - startMin;
      } else if (h === endHour) {
        // Last hour: from 0 to endMin
        minutes = endMin;
      } else {
        // Full hour
        minutes = 60;
      }
      hourlyMinutes[h] += minutes;
    }
  }

  return hourlyMinutes;
}

/**
 * Calculate time slot distribution for a group's intervals
 * Returns minutes and percentage for each time slot
 */
function calculateTimeSlotDistribution(intervals) {
  const slotMinutes = {
    night: 0,
    morning: 0,
    daytime: 0,
    primeTime: 0,
    lateEvening: 0
  };

  const hourlyMinutes = calculateHourlyOutageMinutes(intervals);

  for (let hour = 0; hour < 24; hour++) {
    const minutes = hourlyMinutes[hour];
    if (minutes === 0) continue;

    const slotName = getTimeSlotForHour(hour);
    slotMinutes[slotName] += minutes;
  }

  const total = Object.values(slotMinutes).reduce((a, b) => a + b, 0);

  const result = {};
  for (const [slotName, minutes] of Object.entries(slotMinutes)) {
    result[slotName] = {
      minutes,
      percentage: total > 0 ? (minutes / total) * 100 : 0
    };
  }

  return result;
}

/**
 * Determine if a date key (YYYY-MM-DD) is a weekend
 */
function isWeekend(dateKey) {
  const date = new Date(dateKey + 'T12:00:00'); // Use noon to avoid timezone issues
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Calculate fairness metrics across groups
 * Lower coefficient of variation = more equal distribution
 */
function calculateFairnessMetrics(groupAverages, weightedGroupAverages) {
  // Raw metrics
  const rawValues = Object.values(groupAverages);
  const rawMean = rawValues.reduce((a, b) => a + b, 0) / rawValues.length;
  const rawVariance = rawValues.reduce((sum, v) => sum + Math.pow(v - rawMean, 2), 0) / rawValues.length;
  const rawStdDev = Math.sqrt(rawVariance);
  const rawCv = rawMean > 0 ? (rawStdDev / rawMean) * 100 : 0;

  // Weighted metrics
  const weightedValues = Object.values(weightedGroupAverages);
  const weightedMean = weightedValues.reduce((a, b) => a + b, 0) / weightedValues.length;
  const weightedVariance = weightedValues.reduce((sum, v) => sum + Math.pow(v - weightedMean, 2), 0) / weightedValues.length;
  const weightedStdDev = Math.sqrt(weightedVariance);
  const weightedCv = weightedMean > 0 ? (weightedStdDev / weightedMean) * 100 : 0;

  // Fairness score: 100 = perfectly equal, 0 = completely unequal
  // Using exponential decay: e^(-cv/50) * 100
  const fairnessScore = Math.round(Math.exp(-rawCv / 50) * 100);
  const weightedFairnessScore = Math.round(Math.exp(-weightedCv / 50) * 100);

  return {
    raw: {
      mean: Math.round(rawMean),
      variance: Math.round(rawVariance),
      stdDev: Math.round(rawStdDev),
      coefficientOfVariation: parseFloat(rawCv.toFixed(1))
    },
    weighted: {
      mean: Math.round(weightedMean),
      variance: Math.round(weightedVariance),
      stdDev: Math.round(weightedStdDev),
      coefficientOfVariation: parseFloat(weightedCv.toFixed(1))
    },
    fairnessScore,
    weightedFairnessScore
  };
}

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
 * @param {boolean} excludeWeekends - Whether to exclude Saturday/Sunday
 */
function calculateStatistics(schedulesByDate, fromDate = null, toDate = null, excludeWeekends = false) {
  const dates = Object.keys(schedulesByDate).sort();

  // Filter dates by range and optionally exclude weekends
  let weekendDaysExcluded = 0;
  const filteredDates = dates.filter(date => {
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    if (excludeWeekends && isWeekend(date)) {
      weekendDaysExcluded++;
      return false;
    }
    return true;
  });

  if (filteredDates.length === 0) {
    return {
      dailyStats: [],
      allRecords: [],
      groupComparison: {},
      summary: {
        totalDays: 0,
        overallAverageOutage: 0,
        bestDay: null,
        worstDay: null
      },
      timeOfDayAnalysis: null
    };
  }

  const dailyStats = [];
  const groupTotals = {}; // Track totals for each group across all days

  // NEW: Time-of-day analysis tracking
  const groupWeightedTotals = {}; // Track weighted totals for impact scoring
  const groupHourlyTotals = {}; // Track hourly data for heatmap (group -> hour -> minutes)
  const groupTimeSlotTotals = {}; // Track time slot distributions

  // Initialize group totals
  ALL_GROUPS.forEach(g => {
    groupTotals[g] = { totalMinutes: 0, daysCount: 0 };
    groupWeightedTotals[g] = { totalWeightedMinutes: 0, daysCount: 0 };
    groupHourlyTotals[g] = new Array(24).fill(0);
    groupTimeSlotTotals[g] = {
      night: 0, morning: 0, daytime: 0, primeTime: 0, lateEvening: 0
    };
  });

  for (const date of filteredDates) {
    const daySchedules = schedulesByDate[date];
    if (!daySchedules || daySchedules.length === 0) continue;

    // Get the LATEST schedule for this day (final version)
    const latestSchedule = daySchedules[daySchedules.length - 1];
    const groups = latestSchedule.groups || {};

    let totalOutageMinutes = 0;
    let groupCount = 0;

    for (const groupId of ALL_GROUPS) {
      const groupData = groups[groupId];
      const minutesOff = groupData?.totalMinutesOff || 0;
      const intervals = groupData?.intervals || [];
      totalOutageMinutes += minutesOff;
      groupCount++;

      // Accumulate for group comparison
      groupTotals[groupId].totalMinutes += minutesOff;
      groupTotals[groupId].daysCount++;

      // NEW: Calculate weighted minutes for impact scoring
      let weightedMinutes = 0;
      for (const interval of intervals) {
        weightedMinutes += calculateWeightedMinutes(interval);
      }
      groupWeightedTotals[groupId].totalWeightedMinutes += weightedMinutes;
      groupWeightedTotals[groupId].daysCount++;

      // NEW: Accumulate hourly data for heatmap
      const hourlyMinutes = calculateHourlyOutageMinutes(intervals);
      for (let hour = 0; hour < 24; hour++) {
        groupHourlyTotals[groupId][hour] += hourlyMinutes[hour];
      }

      // NEW: Accumulate time slot distribution
      const timeSlotDist = calculateTimeSlotDistribution(intervals);
      for (const [slotName, data] of Object.entries(timeSlotDist)) {
        groupTimeSlotTotals[groupId][slotName] += data.minutes;
      }
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

  // Build allRecords array for granular view (all schedule updates)
  const allRecords = [];
  for (const date of filteredDates) {
    const daySchedules = schedulesByDate[date] || [];
    for (const schedule of daySchedules) {
      // Calculate stats for this specific schedule
      let totalMinutes = 0;
      for (const groupId of ALL_GROUPS) {
        totalMinutes += schedule.groups[groupId]?.totalMinutesOff ?? 0;
      }
      const avgMinutes = totalMinutes / 12;

      allRecords.push({
        fetchedAt: schedule.fetchedAt,
        date: date,
        scheduleDate: schedule.scheduleDate,
        timestamp: schedule.infoTimestamp,
        averageOutageMinutes: Math.round(avgMinutes),
        percentWithPower: parseFloat(((1440 - avgMinutes) / 1440 * 100).toFixed(1)),
        hoursWithPower: parseFloat(((1440 - avgMinutes) / 60).toFixed(1))
      });
    }
  }

  // Sort by fetchedAt ascending
  allRecords.sort((a, b) => new Date(a.fetchedAt) - new Date(b.fetchedAt));

  // Build group comparison
  const groupComparison = {};
  const groupAverages = [];

  for (const groupId of ALL_GROUPS) {
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

  // ============================================
  // BUILD TIME-OF-DAY ANALYSIS
  // ============================================

  // Build weighted group comparison with impact scores
  const weightedGroupComparison = {};
  const weightedAverages = [];
  const rawAveragesMap = {}; // For fairness calculation
  const weightedAveragesMap = {}; // For fairness calculation

  for (const groupId of ALL_GROUPS) {
    const gt = groupTotals[groupId];
    const wgt = groupWeightedTotals[groupId];
    const avgMinutes = gt.daysCount > 0 ? Math.round(gt.totalMinutes / gt.daysCount) : 0;
    const weightedAvgMinutes = wgt.daysCount > 0 ? Math.round(wgt.totalWeightedMinutes / wgt.daysCount) : 0;

    rawAveragesMap[groupId] = avgMinutes;
    weightedAveragesMap[groupId] = weightedAvgMinutes;

    weightedGroupComparison[groupId] = {
      totalMinutes: gt.totalMinutes,
      averageMinutes: avgMinutes,
      daysCount: gt.daysCount,
      rank: groupComparison[groupId].rank,
      weightedTotalMinutes: Math.round(wgt.totalWeightedMinutes),
      weightedAverageMinutes: weightedAvgMinutes,
      impactScore: 0, // Will be normalized below
      weightedRank: 0 // Will be set below
    };
    weightedAverages.push({ groupId, weightedAvgMinutes });
  }

  // Rank by weighted average (1 = least weighted outage, best)
  weightedAverages.sort((a, b) => a.weightedAvgMinutes - b.weightedAvgMinutes);
  weightedAverages.forEach((item, idx) => {
    weightedGroupComparison[item.groupId].weightedRank = idx + 1;
  });

  // Calculate normalized impact scores (0-100, where 100 = highest impact)
  const maxWeightedAvg = Math.max(...weightedAverages.map(w => w.weightedAvgMinutes));
  for (const groupId of ALL_GROUPS) {
    if (maxWeightedAvg > 0) {
      weightedGroupComparison[groupId].impactScore = Math.round(
        (weightedGroupComparison[groupId].weightedAverageMinutes / maxWeightedAvg) * 100
      );
    }
  }

  // Build hourly heatmap data
  const daysCount = filteredDates.length;
  const hourlyHeatmap = {
    groups: ALL_GROUPS,
    hours: Array.from({ length: 24 }, (_, i) => i),
    data: ALL_GROUPS.map(groupId =>
      groupHourlyTotals[groupId].map(totalMins =>
        daysCount > 0 ? Math.round(totalMins / daysCount) : 0
      )
    ),
    maxValue: 0 // Will be calculated below
  };

  // Find max value for color scale
  hourlyHeatmap.maxValue = Math.max(...hourlyHeatmap.data.flat());

  // Build time slot distribution per group
  const timeSlotDistribution = {};
  for (const groupId of ALL_GROUPS) {
    const totals = groupTimeSlotTotals[groupId];
    const totalMinutes = Object.values(totals).reduce((a, b) => a + b, 0);

    timeSlotDistribution[groupId] = {};
    for (const [slotName, minutes] of Object.entries(totals)) {
      timeSlotDistribution[groupId][slotName] = {
        minutes,
        percentage: totalMinutes > 0 ? parseFloat(((minutes / totalMinutes) * 100).toFixed(1)) : 0
      };
    }
  }

  // Calculate fairness metrics
  const fairnessMetrics = calculateFairnessMetrics(rawAveragesMap, weightedAveragesMap);

  // Build time slot definitions for UI
  const timeSlots = Object.entries(TIME_SLOT_WEIGHTS).map(([id, slot]) => ({
    id,
    label: slot.label,
    startHour: slot.start,
    endHour: slot.end,
    weight: slot.weight,
    color: slot.color
  }));

  const timeOfDayAnalysis = {
    weightedGroupComparison,
    hourlyHeatmap,
    timeSlotDistribution,
    fairnessMetrics,
    excludeWeekends,
    weekendDaysExcluded,
    timeSlots
  };

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
    allRecords,
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
    },
    timeOfDayAnalysis
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
