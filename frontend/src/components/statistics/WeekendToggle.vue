<script setup lang="ts">
import { computed } from 'vue'
import { CalendarOff } from 'lucide-vue-next'
import { useStatisticsStore } from '@/stores/statisticsStore'

const statisticsStore = useStatisticsStore()

const isExcluding = computed(() => statisticsStore.excludeWeekends)

const toggleWeekends = async () => {
  await statisticsStore.setExcludeWeekends(!isExcluding.value)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <button
      @click="toggleWeekends"
      :class="[
        'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition-all duration-200',
        isExcluding
          ? 'border-accent-blue/50 bg-accent-blue/20 text-accent-blue'
          : 'border-white/10 bg-bg-secondary/50 text-gray-300 hover:bg-bg-elevated hover:text-white hover:border-accent-blue/30'
      ]"
    >
      <CalendarOff :size="16" />
      <span>Виключити вихідні</span>
    </button>
    <span v-if="isExcluding" class="text-xs text-gray-400">
      (тільки будні)
    </span>
  </div>
</template>
