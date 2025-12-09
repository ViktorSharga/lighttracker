import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TabId, GroupId, StatusResponse } from '@/services/types'
import { useHistoryStore } from './historyStore'

export const useUIStore = defineStore('ui', () => {
  // State
  const activeTab = ref<TabId>('current')
  const version = ref('')
  const fetchIntervalMs = ref(0)
  const nextFetchIn = ref(0)
  const telegramEnabled = ref(false)
  const telegramSubscribers = ref(0)

  // Actions
  const setActiveTab = (tab: TabId) => {
    activeTab.value = tab
  }

  const updateStatus = (status: StatusResponse) => {
    version.value = status.version
    fetchIntervalMs.value = status.fetchIntervalMs
    nextFetchIn.value = status.nextFetchIn
    telegramEnabled.value = status.telegram.enabled
    telegramSubscribers.value = status.telegram.subscribers
  }

  const navigateToGroupHistory = (groupId: GroupId) => {
    const historyStore = useHistoryStore()

    // Set active tab to history
    activeTab.value = 'history'

    // Select the group in history store
    historyStore.selectGroup(groupId)
  }

  return {
    // State
    activeTab,
    version,
    fetchIntervalMs,
    nextFetchIn,
    telegramEnabled,
    telegramSubscribers,
    // Actions
    setActiveTab,
    updateStatus,
    navigateToGroupHistory
  }
})
