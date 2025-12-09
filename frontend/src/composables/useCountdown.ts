import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { GroupId, Schedule, Interval } from '@/services/types'

/**
 * Calculates and tracks countdown to next power outage for a specific group
 * Updates every second automatically
 */
export function useCountdown(groupId: GroupId, schedule: Schedule | null) {
  const now = ref(new Date())
  let intervalId: ReturnType<typeof setInterval> | null = null

  // Parse time string "HH:MM" to minutes from start of day
  function parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  // Format time duration in Ukrainian format
  function formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} E2`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) {
      return `${hours} 3>4`
    }
    return `${hours} 3>4 ${mins} E2`
  }

  // Find the next outage interval
  const nextOutage = computed(() => {
    if (!schedule) {
      return {
        start: null,
        end: null,
        startsIn: null,
        endsIn: null,
        isCurrentlyOff: false,
        interval: null,
      }
    }

    const groupData = schedule.groups[groupId]
    if (!groupData || groupData.intervals.length === 0) {
      return {
        start: null,
        end: null,
        startsIn: null,
        endsIn: null,
        isCurrentlyOff: false,
        interval: null,
      }
    }

    const currentTime = now.value
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    // Check each interval
    for (const interval of groupData.intervals) {
      const startMinutes = parseTime(interval.start)
      const endMinutes = parseTime(interval.end)

      // Check if we're currently in this outage
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        const endsIn = endMinutes - currentMinutes
        return {
          start: interval.start,
          end: interval.end,
          startsIn: 0,
          endsIn,
          isCurrentlyOff: true,
          interval,
        }
      }

      // Check if this outage is in the future today
      if (currentMinutes < startMinutes) {
        const startsIn = startMinutes - currentMinutes
        return {
          start: interval.start,
          end: interval.end,
          startsIn,
          endsIn: null,
          isCurrentlyOff: false,
          interval,
        }
      }
    }

    // All outages for today have passed, next one is tomorrow
    const firstInterval = groupData.intervals[0]
    const startMinutes = parseTime(firstInterval.start)
    const minutesUntilMidnight = 24 * 60 - currentMinutes
    const startsIn = minutesUntilMidnight + startMinutes

    return {
      start: firstInterval.start,
      end: firstInterval.end,
      startsIn,
      endsIn: null,
      isCurrentlyOff: false,
      interval: firstInterval,
    }
  })

  // Check if outage is starting soon (within 30 minutes)
  const isUrgent = computed(() => {
    if (!nextOutage.value.startsIn) return false
    return nextOutage.value.startsIn <= 30 && nextOutage.value.startsIn > 0
  })

  // Formatted countdown string
  const formattedCountdown = computed(() => {
    const outage = nextOutage.value
    if (!outage.start) {
      return '5<0T 40=8E'
    }

    if (outage.isCurrentlyOff && outage.endsIn !== null) {
      return formatDuration(outage.endsIn)
    }

    if (outage.startsIn !== null) {
      return formatDuration(outage.startsIn)
    }

    return '5<0T 40=8E'
  })

  // Status text in Ukrainian
  const statusText = computed(() => {
    const outage = nextOutage.value
    if (!outage.start) {
      return '5<0T @>7:;04C'
    }

    if (outage.isCurrentlyOff) {
      return '0@07 =5<0T A2VB;0'
    }

    if (outage.startsIn !== null) {
      if (outage.startsIn < 60) {
        return `V4:;NG5==O G5@57 ${formattedCountdown.value}`
      }
      return `!2VB;> T (=0ABC?=5 2V4:;NG5==O: ${outage.start})`
    }

    return '!2VB;> T'
  })

  // Update time every second
  function startTimer() {
    intervalId = setInterval(() => {
      now.value = new Date()
    }, 1000)
  }

  function stopTimer() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  // Start timer on mount
  onMounted(() => {
    startTimer()
  })

  // Clean up on unmount
  onUnmounted(() => {
    stopTimer()
  })

  // Restart timer if schedule changes
  watch(() => schedule, () => {
    now.value = new Date()
  })

  return {
    nextOutage,
    isUrgent,
    formattedCountdown,
    statusText,
  }
}
