import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'
import type { StatisticsResponse, ChartType, GroupComparisonData, RecordStats } from '@/services/types'

export type ChartViewMode = 'daily' | 'records'

export const useStatisticsStore = defineStore('statistics', () => {
  // State
  const statistics = ref<StatisticsResponse | null>(null)
  const comparisonData = ref<Record<string, GroupComparisonData> | null>(null) // Separate state for filtered comparison
  const chartDateFrom = ref<string | null>(null)
  const chartDateTo = ref<string | null>(null)
  const comparisonDateFrom = ref<string | null>(null)
  const comparisonDateTo = ref<string | null>(null)
  const chartType = ref<ChartType>('percent')
  const chartViewMode = ref<ChartViewMode>('daily')
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

  // Helper for record label formatting
  const formatRecordLabel = (record: RecordStats): string => {
    const date = new Date(record.fetchedAt)
    return date.toLocaleString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    })
  }

  const chartData = computed(() => {
    if (!statistics.value) {
      return {
        labels: [],
        datasets: []
      }
    }

    // Select data source based on view mode
    const isRecordsView = chartViewMode.value === 'records'
    let sourceData: (typeof statistics.value.dailyStats[0] | RecordStats)[] = isRecordsView
      ? statistics.value.allRecords
      : statistics.value.dailyStats

    // Apply date filtering
    if (chartDateFrom.value || chartDateTo.value) {
      sourceData = sourceData.filter(item => {
        if (chartDateFrom.value && item.date < chartDateFrom.value) return false
        if (chartDateTo.value && item.date > chartDateTo.value) return false
        return true
      })
    }

    // Format labels (records view shows time + date, daily shows date only)
    const labels = isRecordsView
      ? (sourceData as RecordStats[]).map(r => formatRecordLabel(r))
      : sourceData.map(s => s.scheduleDate)

    // Select data values based on chart type
    const dataValues = chartType.value === 'percent'
      ? sourceData.map(s => s.percentWithPower)
      : sourceData.map(s => s.hoursWithPower)

    const chartLabel = chartType.value === 'percent' ? 'Світла буде (%)' : 'Години зі світлом'
    const colors = chartType.value === 'percent'
      ? { bg: 'rgba(75, 192, 192, 0.6)', border: 'rgba(75, 192, 192, 1)' }
      : { bg: 'rgba(54, 162, 235, 0.6)', border: 'rgba(54, 162, 235, 1)' }

    return {
      labels,
      datasets: [{
        label: chartLabel,
        data: dataValues,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 2,
        tension: 0.1
      }]
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

  const setChartViewMode = (mode: ChartViewMode) => {
    chartViewMode.value = mode
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
    chartViewMode,
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
    setChartType,
    setChartViewMode
  }
})
