import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/api'
import { useMyGroup } from './useMyGroup'
import type { GridStatusResponse, GridStatusValue } from '@/services/types'

/**
 * Composable for fetching and tracking EcoFlow grid status
 * Auto-refreshes every 10 seconds when active
 * Only shows grid status if user's selected group matches ECOFLOW_GROUP
 */
export function useGridStatus() {
  const { myGroup } = useMyGroup()
  const data = ref<GridStatusResponse | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let refreshInterval: ReturnType<typeof setInterval> | null = null

  // Computed properties
  const gridStatus = computed<GridStatusValue>(() => data.value?.current.status ?? 'unknown')

  const isConnected = computed(() => data.value?.current.connected ?? false)

  const lastUpdate = computed(() => data.value?.current.lastUpdate ?? null)

  // EcoFlow integration is active if:
  // 1. We have a valid response with an ecoflowGroup configured
  // 2. User has selected a group that matches the ecoflowGroup
  // 3. Device is connected
  const isActive = computed(() => {
    if (!data.value) return false
    const ecoflowGroup = data.value.current.ecoflowGroup
    if (!ecoflowGroup) return false  // EcoFlow group not configured
    if (!myGroup.value) return false  // User hasn't selected a group
    // Only show for users whose group matches the EcoFlow device's group
    return myGroup.value === ecoflowGroup && data.value.current.connected
  })

  const history = computed(() => data.value?.history ?? [])

  // Status display helpers
  const statusText = computed(() => {
    switch (gridStatus.value) {
      case 'online':
        return 'Мережа'
      case 'offline':
        return 'Немає світла'
      default:
        return '...'
    }
  })

  const statusColor = computed(() => {
    switch (gridStatus.value) {
      case 'online':
        return 'green'
      case 'offline':
        return 'red'
      default:
        return 'gray'
    }
  })

  // Fetch grid status from API
  const refreshGridStatus = async () => {
    isLoading.value = true
    error.value = null
    try {
      const response = await api.getGridStatus(20)
      data.value = response
    } catch (e) {
      // Don't set error for 404 or other "not configured" states
      // This allows the UI to gracefully hide when EcoFlow is not set up
      if (e instanceof Error && !e.message.includes('404')) {
        error.value = e.message
      }
      console.debug('Grid status fetch failed (EcoFlow may not be configured):', e)
    } finally {
      isLoading.value = false
    }
  }

  // Start auto-refresh
  const startAutoRefresh = (intervalMs = 10000) => {
    stopAutoRefresh()
    refreshGridStatus()
    refreshInterval = setInterval(() => {
      refreshGridStatus()
    }, intervalMs)
  }

  // Stop auto-refresh
  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
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
    data,
    gridStatus,
    isConnected,
    lastUpdate,
    isActive,
    history,
    statusText,
    statusColor,
    isLoading,
    error,
    refreshGridStatus,
    startAutoRefresh,
    stopAutoRefresh,
  }
}
