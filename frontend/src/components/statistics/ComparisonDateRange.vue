<script setup lang="ts">
import { computed } from 'vue'
import { Calendar } from 'lucide-vue-next'
import { GlassCard, Input, Button } from '@/components/ui'
import { useStatisticsStore } from '@/stores/statisticsStore'
import { cn } from '@/lib/utils'

const statisticsStore = useStatisticsStore()

// Two-way sync with store using computed get/set
const dateFrom = computed({
  get: () => statisticsStore.comparisonDateFrom || '',
  set: (v) => statisticsStore.setComparisonDateRange(v || null, dateTo.value || null)
})

const dateTo = computed({
  get: () => statisticsStore.comparisonDateTo || '',
  set: (v) => statisticsStore.setComparisonDateRange(dateFrom.value || null, v || null)
})

// Quick preset buttons
const setPreset = (preset: 'week' | 'month' | 'all') => {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  switch (preset) {
    case 'week': {
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 7)
      statisticsStore.setComparisonDateRange(weekAgo.toISOString().split('T')[0], todayStr)
      break
    }
    case 'month': {
      const monthAgo = new Date(today)
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      statisticsStore.setComparisonDateRange(monthAgo.toISOString().split('T')[0], todayStr)
      break
    }
    case 'all': {
      statisticsStore.setComparisonDateRange(null, null)
      break
    }
  }
}

// Check if a preset is active
const isPresetActive = computed(() => {
  const from = dateFrom.value
  const to = dateTo.value

  if (!from && !to) return 'all'

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  if (to === todayStr) {
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekStr = weekAgo.toISOString().split('T')[0]

    const monthAgo = new Date(today)
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    const monthStr = monthAgo.toISOString().split('T')[0]

    if (from === weekStr) return 'week'
    if (from === monthStr) return 'month'
  }

  return null
})
</script>

<template>
  <GlassCard variant="default" class="p-4">
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center gap-2 text-gray-300">
        <Calendar :size="18" />
        <h3 class="text-sm font-medium">Період порівняння груп</h3>
      </div>

      <!-- Date inputs - v-model on computed auto-syncs with store -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label class="text-xs text-gray-400">Від</label>
          <Input
            v-model="dateFrom"
            type="date"
            placeholder="Початок"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-xs text-gray-400">До</label>
          <Input
            v-model="dateTo"
            type="date"
            placeholder="Кінець"
          />
        </div>
      </div>

      <!-- Quick presets -->
      <div class="flex flex-wrap gap-2">
        <Button
          size="sm"
          :variant="isPresetActive === 'week' ? 'default' : 'outline'"
          @click="setPreset('week')"
        >
          Тиждень
        </Button>
        <Button
          size="sm"
          :variant="isPresetActive === 'month' ? 'default' : 'outline'"
          @click="setPreset('month')"
        >
          Місяць
        </Button>
        <Button
          size="sm"
          :variant="isPresetActive === 'all' ? 'default' : 'outline'"
          @click="setPreset('all')"
        >
          Весь час
        </Button>
      </div>
    </div>
  </GlassCard>
</template>
