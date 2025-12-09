import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/services/api'
import type { Schedule, Comparison, GroupId } from '@/services/types'

export const useScheduleStore = defineStore('schedule', () => {
  // State
  const current = ref<Schedule | null>(null)
  const previous = ref<Schedule | null>(null)
  const comparison = ref<Comparison | null>(null)
  const dateKey = ref<string | null>(null)
  const lastFetchTime = ref<string | null>(null)
  const lastFetchError = ref<string | null>(null)
  const isFetching = ref(false)
  const isLoading = ref(false)

  // Getters
  const hasChanges = computed(() => {
    return comparison.value?.hasChanges ?? false
  })

  const groupsWithMoreOutage = computed(() => {
    return comparison.value?.summary.groupsWithMoreOutage ?? 0
  })

  const groupsWithLessOutage = computed(() => {
    return comparison.value?.summary.groupsWithLessOutage ?? 0
  })

  const getGroupData = (groupId: GroupId) => {
    const currentData = current.value?.groups[groupId]
    const previousData = previous.value?.groups[groupId]
    const change = comparison.value?.groupChanges[groupId]

    return {
      current: currentData ?? null,
      previous: previousData ?? null,
      change: change ?? null
    }
  }

  // Actions
  const fetchSchedule = async (): Promise<void> => {
    isLoading.value = true
    try {
      const response = await api.getSchedule()

      current.value = response.current
      previous.value = response.previous
      comparison.value = response.comparison
      dateKey.value = response.dateKey
      lastFetchTime.value = response.lastFetchTime
      lastFetchError.value = response.lastFetchError
      isFetching.value = response.isFetching
    } catch (error) {
      console.error('Failed to fetch schedule:', error)
      lastFetchError.value = error instanceof Error ? error.message : 'Unknown error'
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const forceFetch = async (): Promise<void> => {
    try {
      await api.forceFetch()
      // After forcing fetch, wait a moment then refresh the schedule
      setTimeout(() => {
        fetchSchedule()
      }, 1000)
    } catch (error) {
      console.error('Failed to force fetch:', error)
      throw error
    }
  }

  const setLoading = (loading: boolean) => {
    isLoading.value = loading
  }

  return {
    // State
    current,
    previous,
    comparison,
    dateKey,
    lastFetchTime,
    lastFetchError,
    isFetching,
    isLoading,
    // Getters
    hasChanges,
    groupsWithMoreOutage,
    groupsWithLessOutage,
    getGroupData,
    // Actions
    fetchSchedule,
    forceFetch,
    setLoading
  }
})
