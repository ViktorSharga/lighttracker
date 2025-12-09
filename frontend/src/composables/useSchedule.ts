import { ref, computed, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useScheduleStore } from '@/stores/scheduleStore'

/**
 * Composable that wraps scheduleStore with additional reactive helpers
 * Provides auto-refresh functionality and simplified access to schedule data
 */
export function useSchedule() {
  const store = useScheduleStore()
  const { current, previous, comparison, isLoading, lastFetchTime } = storeToRefs(store)

  let refreshInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Starts auto-refresh interval that calls fetchSchedule periodically
   * @param intervalMs Interval in milliseconds (default: 30000ms = 30s)
   * @returns Cleanup function to stop auto-refresh
   */
  const autoRefresh = (intervalMs = 30000) => {
    // Clear any existing interval
    if (refreshInterval) {
      clearInterval(refreshInterval)
    }

    // Set up new interval
    refreshInterval = setInterval(() => {
      store.fetchSchedule()
    }, intervalMs)

    // Return cleanup function
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval)
        refreshInterval = null
      }
    }
  }

  // Clean up on unmount
  onUnmounted(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  })

  return {
    // Computed refs from store
    schedule: current,
    previous,
    comparison,
    isLoading,
    lastFetchTime,

    // Methods
    refresh: () => store.fetchSchedule(),
    forceFetch: () => store.forceFetch(),
    autoRefresh,
  }
}
