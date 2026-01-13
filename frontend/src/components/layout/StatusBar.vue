<script setup lang="ts">
import { computed } from 'vue'
import { Zap } from 'lucide-vue-next'
import { StatusDot } from '@/components/ui'
import { useStatus } from '@/composables/useStatus'
import { useGridStatus } from '@/composables/useGridStatus'
import { useScheduleStore } from '@/stores/scheduleStore'

// Composables and stores
// useStatus provides nextFetchIn which already counts down every second
const { status, isOnline, nextFetchIn, telegramStats } = useStatus()
const { isActive: gridIsActive, gridStatus, statusText: gridStatusText, statusColor: gridStatusColor } = useGridStatus()
const scheduleStore = useScheduleStore()

// Computed: Status dot state
const statusDotState = computed<'online' | 'offline' | 'fetching'>(() => {
  if (scheduleStore.isFetching) {
    return 'fetching'
  }
  return isOnline.value ? 'online' : 'offline'
})

// Computed: Last fetch time formatted as HH:MM
const lastFetchTimeFormatted = computed(() => {
  if (!status.value?.lastFetchTime) {
    return '--:--'
  }

  const date = new Date(status.value.lastFetchTime)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
})

// Computed: Next fetch countdown formatted
// Uses nextFetchIn directly from useStatus (already decrements every second)
const nextFetchFormatted = computed(() => {
  const seconds = nextFetchIn.value

  if (seconds <= 0) {
    return '0с'
  }

  if (seconds < 60) {
    return `${seconds}с`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (remainingSeconds === 0) {
    return `${minutes}хв`
  }

  return `${minutes}хв ${remainingSeconds}с`
})

// Computed: Telegram subscribers display
const telegramDisplay = computed(() => {
  if (!telegramStats.value.enabled) {
    return null
  }

  return {
    count: telegramStats.value.subscribers,
    hasGroups: Object.keys(telegramStats.value.byGroup).length > 0
  }
})
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-3 rounded-lg bg-glass-card/60 px-4 py-2 text-sm backdrop-blur-sm border border-white/5"
  >
    <!-- Grid Status (EcoFlow) - only show if active -->
    <template v-if="gridIsActive">
      <div class="flex items-center gap-1.5">
        <Zap
          :class="[
            'h-4 w-4',
            gridStatusColor === 'green' ? 'text-accent-green' : '',
            gridStatusColor === 'red' ? 'text-accent-red' : '',
            gridStatusColor === 'gray' ? 'text-gray-500' : ''
          ]"
        />
        <span
          :class="[
            'font-medium',
            gridStatusColor === 'green' ? 'text-accent-green' : '',
            gridStatusColor === 'red' ? 'text-accent-red' : '',
            gridStatusColor === 'gray' ? 'text-gray-500' : ''
          ]"
        >
          {{ gridStatusText }}
        </span>
      </div>

      <!-- Separator -->
      <span class="hidden sm:block text-gray-700">•</span>
    </template>

    <!-- Status Indicator -->
    <div class="flex items-center gap-2">
      <StatusDot :status="statusDotState" />
      <span class="text-gray-400">Статус</span>
    </div>

    <!-- Separator -->
    <span class="hidden sm:block text-gray-700">•</span>

    <!-- Last Update -->
    <div class="flex items-center gap-1.5">
      <span class="text-gray-400">Останнє оновлення:</span>
      <span class="font-medium text-gray-200">{{ lastFetchTimeFormatted }}</span>
    </div>

    <!-- Separator -->
    <span class="hidden sm:block text-gray-700">•</span>

    <!-- Next Fetch Countdown -->
    <div class="flex items-center gap-1.5">
      <span class="text-gray-400">Наступне через:</span>
      <span class="font-medium text-accent-blue">{{ nextFetchFormatted }}</span>
    </div>

    <!-- Telegram Stats (if enabled) -->
    <template v-if="telegramDisplay">
      <!-- Separator -->
      <span class="hidden sm:block text-gray-700">•</span>

      <div class="flex items-center gap-1.5">
        <span class="text-gray-400">Telegram:</span>
        <span class="font-medium text-accent-green">
          {{ telegramDisplay.count }} підписників
        </span>
        <span v-if="telegramDisplay.hasGroups" class="text-gray-500 text-xs">
          по групах
        </span>
      </div>
    </template>
  </div>
</template>
