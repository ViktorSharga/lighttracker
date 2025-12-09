import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useHistoryStore } from '@/stores/historyStore'

/**
 * Composable that wraps historyStore with helper functions
 * Provides simplified access to historical schedule data
 */
export function useHistory() {
  const store = useHistoryStore()
  const {
    availableDates,
    selectedDateKey,
    historyData,
    isLoading,
    currentDaySummary,
    changesTimeline,
  } = storeToRefs(store)

  // Computed properties
  const summary = computed(() => currentDaySummary.value)
  const timeline = computed(() => changesTimeline.value)
  const selectedDate = computed({
    get: () => selectedDateKey.value,
    set: (value: string | null) => {
      if (value && value !== selectedDateKey.value) {
        store.selectDate(value)
      }
    },
  })

  return {
    // State
    availableDates,
    selectedDate,
    summary,
    timeline,
    isLoading,

    // Methods
    selectDate: (dateKey: string) => store.selectDate(dateKey),
    fetchHistory: (dateKey: string) => store.fetchHistory(dateKey),
    fetchDates: () => store.fetchDates(),
  }
}
