import { computed } from 'vue'
import type { GroupData } from '@/services/types'

interface TimelineSegment {
  hour: number
  minute: number
  duration: number
  isPowerOff: boolean
}

interface HourlyBreakdown {
  hour: number
  minutesOff: number
  percentOff: number
}

/**
 * Processes schedule data for 24-hour timeline visualization
 * Provides formatted data for rendering power outage timelines
 */
export function useTimelineData(groupData: GroupData | null) {
  /**
   * Parse time string "HH:MM" into hours and minutes
   */
  const parseTime = (timeStr: string): { hour: number; minute: number } => {
    const [hour, minute] = timeStr.split(':').map(Number)
    return { hour, minute }
  }

  /**
   * Generate timeline segments showing power status throughout the day
   * Each segment represents a continuous period of power on/off
   */
  const segments = computed<TimelineSegment[]>(() => {
    if (!groupData || groupData.intervals.length === 0) {
      // If no intervals, power is on all day
      return [
        {
          hour: 0,
          minute: 0,
          duration: 24 * 60,
          isPowerOff: false,
        },
      ]
    }

    const result: TimelineSegment[] = []
    const intervals = [...groupData.intervals].sort((a, b) => {
      const aTime = parseTime(a.start)
      const bTime = parseTime(b.start)
      return aTime.hour * 60 + aTime.minute - (bTime.hour * 60 + bTime.minute)
    })

    let currentMinute = 0 // Start of day

    for (const interval of intervals) {
      const start = parseTime(interval.start)
      const end = parseTime(interval.end)
      const startMinute = start.hour * 60 + start.minute
      const endMinute = end.hour * 60 + end.minute

      // Add power-on segment before this outage (if any)
      if (startMinute > currentMinute) {
        result.push({
          hour: Math.floor(currentMinute / 60),
          minute: currentMinute % 60,
          duration: startMinute - currentMinute,
          isPowerOff: false,
        })
      }

      // Add power-off segment (the outage)
      result.push({
        hour: start.hour,
        minute: start.minute,
        duration: interval.durationMinutes,
        isPowerOff: true,
      })

      currentMinute = endMinute
    }

    // Add final power-on segment until end of day (if any)
    if (currentMinute < 24 * 60) {
      result.push({
        hour: Math.floor(currentMinute / 60),
        minute: currentMinute % 60,
        duration: 24 * 60 - currentMinute,
        isPowerOff: false,
      })
    }

    return result
  })

  /**
   * Calculate minutes without power for each hour of the day
   */
  const hourlyBreakdown = computed<HourlyBreakdown[]>(() => {
    if (!groupData || groupData.intervals.length === 0) {
      // No outages, all hours have 0 minutes off
      return Array.from({ length: 24 }, (_, hour) => ({
        hour,
        minutesOff: 0,
        percentOff: 0,
      }))
    }

    // Initialize all hours with 0 minutes off
    const breakdown: number[] = new Array(24).fill(0)

    // Process each interval
    for (const interval of groupData.intervals) {
      const start = parseTime(interval.start)
      const end = parseTime(interval.end)
      const startMinute = start.hour * 60 + start.minute
      const endMinute = end.hour * 60 + end.minute

      // Calculate minutes off for each hour affected by this interval
      for (let minute = startMinute; minute < endMinute; minute++) {
        const hour = Math.floor(minute / 60)
        breakdown[hour]++
      }
    }

    // Convert to HourlyBreakdown objects
    return breakdown.map((minutesOff, hour) => ({
      hour,
      minutesOff,
      percentOff: (minutesOff / 60) * 100,
    }))
  })

  /**
   * Total minutes without power for the day
   */
  const totalMinutesOff = computed(() => {
    return groupData?.totalMinutesOff ?? 0
  })

  /**
   * Total hours without power, formatted as "X 3>4 Y E2"
   */
  const totalHoursFormatted = computed(() => {
    const minutes = totalMinutesOff.value
    if (minutes === 0) {
      return '0 E2'
    }

    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60

    if (hours === 0) {
      return `${mins} E2`
    }

    if (mins === 0) {
      return `${hours} 3>4`
    }

    return `${hours} 3>4 ${mins} E2`
  })

  /**
   * Percentage of day with power
   */
  const percentWithPower = computed(() => {
    const minutesWithPower = 24 * 60 - totalMinutesOff.value
    return ((minutesWithPower / (24 * 60)) * 100).toFixed(1)
  })

  /**
   * Percentage of day without power
   */
  const percentWithoutPower = computed(() => {
    return ((totalMinutesOff.value / (24 * 60)) * 100).toFixed(1)
  })

  return {
    segments,
    hourlyBreakdown,
    totalMinutesOff,
    totalHoursFormatted,
    percentWithPower,
    percentWithoutPower,
  }
}
