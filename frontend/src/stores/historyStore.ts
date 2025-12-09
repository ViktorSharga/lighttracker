import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'
import type { HistoryResponse, GroupId } from '@/services/types'

export const useHistoryStore = defineStore('history', () => {
  // State
  const availableDates = ref<string[]>([])
  const selectedDateKey = ref<string | null>(null)
  const selectedGroupId = ref<GroupId | null>(null)
  const historyData = ref<HistoryResponse | null>(null)
  const isLoading = ref(false)

  // Getters
  const currentDaySummary = computed(() => {
    return historyData.value?.summary ?? null
  })

  const changesTimeline = computed(() => {
    return historyData.value?.summary.changesTimeline ?? []
  })

  const selectedGroupHistory = computed(() => {
    if (!selectedGroupId.value || !historyData.value) {
      return null
    }
    return historyData.value.summary.groupSummaries[selectedGroupId.value] ?? null
  })

  // Actions
  const fetchDates = async (): Promise<void> => {
    try {
      const response = await api.getDates()
      availableDates.value = response.dates
    } catch (error) {
      console.error('Failed to fetch dates:', error)
      throw error
    }
  }

  const fetchHistory = async (dateKey: string): Promise<void> => {
    isLoading.value = true
    try {
      const response = await api.getHistory(dateKey)
      historyData.value = response
      selectedDateKey.value = dateKey
    } catch (error) {
      console.error('Failed to fetch history:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const selectDate = (dateKey: string) => {
    if (dateKey !== selectedDateKey.value) {
      selectedDateKey.value = dateKey
      fetchHistory(dateKey)
    }
  }

  const selectGroup = (groupId: GroupId | null) => {
    selectedGroupId.value = groupId
  }

  return {
    // State
    availableDates,
    selectedDateKey,
    selectedGroupId,
    historyData,
    isLoading,
    // Getters
    currentDaySummary,
    changesTimeline,
    selectedGroupHistory,
    // Actions
    fetchDates,
    fetchHistory,
    selectDate,
    selectGroup
  }
})
