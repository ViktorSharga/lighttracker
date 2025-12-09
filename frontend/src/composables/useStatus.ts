import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/api'
import type { StatusResponse } from '@/services/types'

/**
 * Composable for fetching and tracking system status
 * Auto-refreshes every 5 seconds
 */
export function useStatus() {
  const status = ref<StatusResponse | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const nextFetchIn = ref(0)

  let refreshInterval: ReturnType<typeof setInterval> | null = null
  let countdownInterval: ReturnType<typeof setInterval> | null = null

  // Computed properties
  const version = computed(() => status.value?.version ?? 'Unknown')

  const isOnline = computed(() => {
    if (!status.value || !status.value.lastFetchTime) {
      return false
    }
    // Consider online if last fetch was successful and recent (within 5 minutes)
    const lastFetch = new Date(status.value.lastFetchTime)
    const now = new Date()
    const diffMinutes = (now.getTime() - lastFetch.getTime()) / 1000 / 60
    return diffMinutes < 5 && !status.value.lastFetchError
  })

  const telegramStats = computed(() => {
    if (!status.value) {
      return {
        enabled: false,
        subscribers: 0,
        byGroup: {},
      }
    }
    return {
      enabled: status.value.telegram.enabled,
      subscribers: status.value.telegram.subscribers,
      byGroup: status.value.telegram.byGroup,
    }
  })

  // Fetch status from API
  const refreshStatus = async () => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.getStatus()
      status.value = response

      // Update nextFetchIn from response
      if (response.nextFetchIn) {
        nextFetchIn.value = Math.ceil(response.nextFetchIn / 1000)
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch status'
      console.error('Failed to fetch status:', e)
    } finally {
      isLoading.value = false
    }
  }

  // Start auto-refresh
  const startAutoRefresh = (intervalMs = 5000) => {
    // Stop existing intervals
    stopAutoRefresh()

    // Fetch immediately
    refreshStatus()

    // Set up refresh interval
    refreshInterval = setInterval(() => {
      refreshStatus()
    }, intervalMs)

    // Set up countdown interval (update every second)
    countdownInterval = setInterval(() => {
      if (nextFetchIn.value > 0) {
        nextFetchIn.value--
      }
    }, 1000)
  }

  // Stop auto-refresh
  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
    if (countdownInterval) {
      clearInterval(countdownInterval)
      countdownInterval = null
    }
  }

  // Start on mount
  onMounted(() => {
    startAutoRefresh()
  })

  // Clean up on unmount
  onUnmounted(() => {
    stopAutoRefresh()
  })

  return {
    status,
    version,
    isOnline,
    nextFetchIn,
    telegramStats,
    isLoading,
    error,
    refreshStatus,
    startAutoRefresh,
    stopAutoRefresh,
  }
}
