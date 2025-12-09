import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'
import type { StatisticsResponse, ChartType, GroupComparisonData } from '@/services/types'

export const useStatisticsStore = defineStore('statistics', () => {
  // State
  const statistics = ref<StatisticsResponse | null>(null)
  const comparisonData = ref<Record<string, GroupComparisonData> | null>(null) // Separate state for filtered comparison
  const chartDateFrom = ref<string | null>(null)
  const chartDateTo = ref<string | null>(null)
  const comparisonDateFrom = ref<string | null>(null)
  const comparisonDateTo = ref<string | null>(null)
  const chartType = ref<ChartType>('percent')
  const isLoading = ref(false)

  // Getters
  const dailyStats = computed(() => {
    return statistics.value?.dailyStats ?? []
  })

  const groupComparison = computed(() => {
    // Use filtered comparison data if available, otherwise fall back to main statistics
    return comparisonData.value ?? statistics.value?.groupComparison ?? {}
  })

  const summary = computed(() => {
    return statistics.value?.summary ?? null
  })

  const chartData = computed(() => {
    if (!statistics.value) {
      return {
        labels: [],
        datasets: []
      }
    }

    const stats = statistics.value.dailyStats

    // Filter by chart date range if specified
    let filteredStats = stats
    if (chartDateFrom.value || chartDateTo.value) {
      filteredStats = stats.filter(stat => {
        if (chartDateFrom.value && stat.date < chartDateFrom.value) return false
        if (chartDateTo.value && stat.date > chartDateTo.value) return false
        return true
      })
    }

    const labels = filteredStats.map(stat => stat.scheduleDate)

    if (chartType.value === 'percent') {
      return {
        labels,
        datasets: [{
          label: 'Світла буде (%)',
          data: filteredStats.map(stat => stat.percentWithPower),
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 2,
          tension: 0.1
        }]
      }
    } else {
      return {
        labels,
        datasets: [{
          label: 'Години зі світлом',
          data: filteredStats.map(stat => stat.hoursWithPower),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          tension: 0.1
        }]
      }
    }
  })

  // Actions
  const fetchStatistics = async (): Promise<void> => {
    isLoading.value = true
    try {
      // Fetch ALL statistics - filtering is done client-side
      const response = await api.getStatistics()
      statistics.value = response
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const setChartDateRange = (from: string | null, to: string | null) => {
    chartDateFrom.value = from
    chartDateTo.value = to
  }

  const setComparisonDateRange = async (from: string | null, to: string | null) => {
    comparisonDateFrom.value = from
    comparisonDateTo.value = to

    // Fetch filtered data for comparison table only
    if (from || to) {
      try {
        const response = await api.getStatistics(from ?? undefined, to ?? undefined)
        comparisonData.value = response.groupComparison
      } catch (error) {
        console.error('Failed to fetch comparison data:', error)
      }
    } else {
      // Reset to use main statistics data when no filter
      comparisonData.value = null
    }
  }

  const setChartType = (type: ChartType) => {
    chartType.value = type
  }

  return {
    // State
    statistics,
    comparisonData,
    chartDateFrom,
    chartDateTo,
    comparisonDateFrom,
    comparisonDateTo,
    chartType,
    isLoading,
    // Getters
    dailyStats,
    groupComparison,
    summary,
    chartData,
    // Actions
    fetchStatistics,
    setChartDateRange,
    setComparisonDateRange,
    setChartType
  }
})
