<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clock, ChevronDown, ChevronUp } from 'lucide-vue-next'
import HourlyHeatmap from './HourlyHeatmap.vue'
import TimeSlotDistributionChart from './TimeSlotDistributionChart.vue'
import FairnessMetricsCard from './FairnessMetricsCard.vue'
import { useStatisticsStore } from '@/stores/statisticsStore'

const statisticsStore = useStatisticsStore()

const hasData = computed(() => {
  return statisticsStore.timeOfDayAnalysis !== null
})

// Section collapse states
const sections = ref({
  heatmap: true,
  distribution: true,
  fairness: true
})

const toggleSection = (section: keyof typeof sections.value) => {
  sections.value[section] = !sections.value[section]
}
</script>

<template>
  <div class="space-y-6" v-if="hasData">
    <!-- Section Header -->
    <div class="flex items-center gap-3">
      <Clock :size="24" class="text-accent-blue" />
      <div>
        <h2 class="text-xl font-semibold text-white">Аналіз впливу часу доби</h2>
        <p class="text-sm text-gray-400">
          Детальний аналіз коли відбуваються відключення та їх реальний вплив
        </p>
      </div>
    </div>

    <!-- Fairness Metrics (always visible at top) -->
    <div>
      <button
        @click="toggleSection('fairness')"
        class="w-full flex items-center justify-between p-3 bg-bg-secondary/50 rounded-lg hover:bg-bg-secondary transition-colors mb-2"
      >
        <span class="text-sm font-medium text-gray-300">Справедливість розподілу</span>
        <component :is="sections.fairness ? ChevronUp : ChevronDown" :size="18" class="text-gray-400" />
      </button>
      <FairnessMetricsCard v-show="sections.fairness" />
    </div>

    <!-- Heatmap -->
    <div>
      <button
        @click="toggleSection('heatmap')"
        class="w-full flex items-center justify-between p-3 bg-bg-secondary/50 rounded-lg hover:bg-bg-secondary transition-colors mb-2"
      >
        <span class="text-sm font-medium text-gray-300">Теплова карта відключень по годинах</span>
        <component :is="sections.heatmap ? ChevronUp : ChevronDown" :size="18" class="text-gray-400" />
      </button>
      <HourlyHeatmap v-show="sections.heatmap" />
    </div>

    <!-- Time Slot Distribution -->
    <div>
      <button
        @click="toggleSection('distribution')"
        class="w-full flex items-center justify-between p-3 bg-bg-secondary/50 rounded-lg hover:bg-bg-secondary transition-colors mb-2"
      >
        <span class="text-sm font-medium text-gray-300">Розподіл по часу доби</span>
        <component :is="sections.distribution ? ChevronUp : ChevronDown" :size="18" class="text-gray-400" />
      </button>
      <TimeSlotDistributionChart v-show="sections.distribution" />
    </div>
  </div>

  <!-- Empty state when no data -->
  <div v-else class="text-center py-12">
    <Clock :size="48" class="mx-auto mb-4 text-gray-600" />
    <p class="text-gray-400">Аналіз часу доби недоступний</p>
    <p class="text-sm text-gray-500 mt-2">
      Оберіть період з даними для перегляду аналізу
    </p>
  </div>
</template>
