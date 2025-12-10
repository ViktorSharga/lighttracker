<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { AppHeader, StatusBar, TabNavigation } from '@/components/layout'
import { CurrentTab, HistoryTab, StatisticsTab } from '@/views'
import { Toaster } from '@/components/ui'
import { useUIStore } from '@/stores/uiStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useStatus } from '@/composables/useStatus'

// Initialize stores
const uiStore = useUIStore()
const { activeTab } = storeToRefs(uiStore)
const preferencesStore = usePreferencesStore()

// Initialize status monitoring
const { startAutoRefresh } = useStatus()

// Computed component based on active tab
const currentTabComponent = computed(() => {
  switch (activeTab.value) {
    case 'current':
      return CurrentTab
    case 'history':
      return HistoryTab
    case 'statistics':
      return StatisticsTab
    default:
      return CurrentTab
  }
})

// Initialize application
onMounted(() => {
  // Load user preferences from localStorage
  preferencesStore.loadFromStorage()

  // Start status refresh
  startAutoRefresh()
})
</script>

<template>
  <div class="min-h-screen bg-bg-primary text-white">
    <!-- App Header -->
    <AppHeader />

    <!-- Status Bar -->
    <StatusBar />

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-6">
      <!-- Tab Navigation -->
      <TabNavigation />

      <!-- Tab Content with Transition -->
      <div class="mt-6">
        <Transition name="fade" mode="out-in">
          <component
            :is="currentTabComponent"
            :key="activeTab"
          />
        </Transition>
      </div>
    </main>

    <!-- Toast Notifications -->
    <Toaster />
  </div>
</template>

<style scoped>
/* Fade transition for tab switching */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
