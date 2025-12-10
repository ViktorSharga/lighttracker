// types.ts - Complete TypeScript definitions for LightTracker API

// ============================================
// SCHEDULE DATA STRUCTURES
// ============================================

export interface Interval {
  start: string;  // "HH:MM" format
  end: string;    // "HH:MM" format
  durationMinutes: number;
}

export interface GroupData {
  intervalsText: string;  // Original Ukrainian text
  intervals: Interval[];
  totalMinutesOff: number;
}

export interface Schedule {
  fetchedAt: string;       // ISO 8601 timestamp
  scheduleDate: string;    // "DD.MM.YYYY" display format
  infoTimestamp: string;   // "HH:MM DD.MM.YYYY"
  groups: Record<string, GroupData>;  // "1.1", "1.2", etc.
}

// ============================================
// COMPARISON DATA STRUCTURES
// ============================================

export type ChangeStatus = 'better' | 'worse' | 'unchanged';

export interface GroupChange {
  groupId: string;
  currentMinutesOff: number;
  previousMinutesOff: number;
  differenceMinutes: number;
  differenceFormatted: string;  // "+30 хв", "-1 год"
  currentIntervals: string;
  previousIntervals: string;
  status: ChangeStatus;
}

export interface ComparisonSummary {
  totalMinutesChange: number;
  totalChangeFormatted: string;
  groupsWithMoreOutage: number;
  groupsWithLessOutage: number;
  groupsUnchanged: number;
  averageChangePerGroup: number;
  averageChangeFormatted: string;
  overallImpactPercent: string;
  humanReadable: string;  // Ukrainian text
}

export interface Comparison {
  hasChanges: boolean;
  groupChanges: Record<string, GroupChange>;
  summary: ComparisonSummary;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ScheduleResponse {
  version: string;
  lastFetchTime: string | null;
  lastFetchError: string | null;
  isFetching: boolean;
  dateKey: string;
  current: Schedule | null;
  previous: Schedule | null;
  comparison: Comparison | null;
}

export interface DatesResponse {
  dates: string[];  // YYYY-MM-DD format, sorted descending
}

export interface ScheduleByDateResponse {
  dateKey: string;
  current: Schedule | null;
  previous: Schedule | null;
  comparison: Comparison | null;
  allVersions: Schedule[];
}

// ============================================
// HISTORY DATA STRUCTURES
// ============================================

export interface GroupHistoryChange {
  timestamp: string;
  diff: number;
  diffFormatted: string;
  from: string;
  to: string;
}

export interface GroupSummary {
  changes: GroupHistoryChange[];
  totalChange: number;
  initialMinutes: number;
  finalMinutes: number;
  netChange: number;
  netChangeFormatted: string;
  changeCount: number;
}

export interface TimelineChangeEntry {
  diff: number;
  diffFormatted: string;
  from: string;
  to: string;
  status: ChangeStatus;
}

export interface ChangeTimelineEntry {
  fromTimestamp: string;
  toTimestamp: string;
  summary: ComparisonSummary;
  groupChanges: Record<string, TimelineChangeEntry>;
}

export interface HistorySummary {
  updateCount: number;
  firstUpdate: string;
  lastUpdate: string;
  totalChanges: number;
  changesTimeline: ChangeTimelineEntry[];
  groupSummaries: Record<string, GroupSummary>;
}

export interface HistoryResponse {
  dateKey: string;
  summary: HistorySummary;
  schedules: Schedule[];
}

// ============================================
// STATISTICS DATA STRUCTURES
// ============================================

export interface DailyStats {
  date: string;           // YYYY-MM-DD
  scheduleDate: string;   // DD.MM.YYYY
  totalOutageMinutes: number;
  averageOutageMinutes: number;
  percentWithPower: number;
  hoursWithPower: number;
  hoursWithoutPower: string;
}

export interface RecordStats {
  fetchedAt: string;      // ISO timestamp
  date: string;           // YYYY-MM-DD
  scheduleDate: string;   // DD.MM.YYYY
  timestamp: string;      // HH:MM DD.MM.YYYY (from source)
  averageOutageMinutes: number;
  percentWithPower: number;
  hoursWithPower: number;
}

export interface GroupComparisonData {
  totalMinutes: number;
  averageMinutes: number;
  daysCount: number;
  rank: number;  // 1 = best (least outage)
}

export interface DayInfo {
  date: string;
  avgMinutes: number;
  formatted: string;
}

export interface StatisticsSummary {
  totalDays: number;
  overallAverageOutage: number;
  overallAverageFormatted: string;
  bestDay: DayInfo | null;
  worstDay: DayInfo | null;
}

export interface StatisticsResponse {
  dailyStats: DailyStats[];
  allRecords: RecordStats[];
  groupComparison: Record<string, GroupComparisonData>;
  summary: StatisticsSummary;
}

// ============================================
// STATUS DATA STRUCTURES
// ============================================

export interface TelegramStatus {
  enabled: boolean;
  subscribers: number;
  byGroup: Record<string, number>;
}

export interface StatusResponse {
  version: string;
  lastFetchTime: string | null;
  lastFetchError: string | null;
  isFetching: boolean;
  fetchIntervalMs: number;
  nextFetchIn: number;  // milliseconds
  telegram: TelegramStatus;
}

// ============================================
// FETCH RESPONSE
// ============================================

export interface FetchResultItem {
  date: string;
  added: boolean;
  reason: string | null;
  isNewDay: boolean;
}

export interface FetchResponse {
  success: boolean;
  schedules: FetchResultItem[];
}

// ============================================
// UTILITY TYPES
// ============================================

export type GroupId = '1.1' | '1.2' | '2.1' | '2.2' | '3.1' | '3.2' |
                      '4.1' | '4.2' | '5.1' | '5.2' | '6.1' | '6.2';

export const ALL_GROUPS: GroupId[] = [
  '1.1', '1.2', '2.1', '2.2', '3.1', '3.2',
  '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'
];

export type TabId = 'current' | 'history' | 'statistics';

export type ChartType = 'percent' | 'hours';

// ============================================
// UI STATE TYPES
// ============================================

export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface CountdownState {
  minutesRemaining: number;
  isUrgent: boolean;  // < 30 minutes
  isInOutage: boolean;
  nextInterval: Interval | null;
  targetGroup: GroupId | null;
}
