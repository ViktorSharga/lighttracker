import { computed, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import { useStatisticsStore } from '@/stores/statisticsStore'
import type { ChartType } from '@/services/types'

/**
 * Composable that wraps statisticsStore with chart helper functions
 * Provides formatted data for Chart.js visualization
 */
export function useStatistics() {
  const store = useStatisticsStore()
  const {
    statistics,
    chartDateFrom,
    chartDateTo,
    comparisonDateFrom,
    comparisonDateTo,
    chartType,
    isLoading,
    chartData,
  } = storeToRefs(store)

  // Reactive date range objects for easier two-way binding
  const chartDateRange = reactive({
    from: chartDateFrom,
    to: chartDateTo,
  })

  const comparisonDateRange = reactive({
    from: comparisonDateFrom,
    to: comparisonDateTo,
  })

  // Computed group rankings (sorted by rank)
  const groupRankings = computed(() => {
    if (!statistics.value) return []

    return Object.entries(statistics.value.groupComparison)
      .map(([groupId, data]) => ({
        groupId,
        ...data,
      }))
      .sort((a, b) => a.rank - b.rank)
  })

  return {
    // State
    statistics,
    chartData,
    groupRankings,
    chartDateRange,
    comparisonDateRange,
    chartType,
    isLoading,

    // Methods
    fetchStats: (from?: string, to?: string) => {
      if (from !== undefined || to !== undefined) {
        store.setComparisonDateRange(from ?? null, to ?? null)
      } else {
        store.fetchStatistics()
      }
    },
    setChartDateRange: (from: string | null, to: string | null) =>
      store.setChartDateRange(from, to),
    setComparisonDateRange: (from: string | null, to: string | null) =>
      store.setComparisonDateRange(from, to),
    setChartType: (type: ChartType) => store.setChartType(type),
  }
}
