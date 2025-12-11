<script setup lang="ts">
import { ref, computed } from 'vue'
import { Calendar } from 'lucide-vue-next'
import GlassCard from '@/components/ui/GlassCard.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import WeekendToggle from './WeekendToggle.vue'
import { useStatisticsStore } from '@/stores/statisticsStore'

const statisticsStore = useStatisticsStore()

// Local state for date inputs
const localDateFrom = ref<string>(statisticsStore.chartDateFrom || '')
const localDateTo = ref<string>(statisticsStore.chartDateTo || '')

// Update store when dates change
const updateDateRange = () => {
  statisticsStore.setChartDateRange(
    localDateFrom.value || null,
    localDateTo.value || null
  )
}

// Chart type toggle
const toggleChartType = (type: 'percent' | 'hours') => {
  statisticsStore.setChartType(type)
}

// Quick preset handlers
const setLastWeek = () => {
  const today = new Date()
  const lastWeek = new Date(today)
  lastWeek.setDate(today.getDate() - 7)

  localDateFrom.value = formatDateForInput(lastWeek)
  localDateTo.value = formatDateForInput(today)
  updateDateRange()
}

const setLastMonth = () => {
  const today = new Date()
  const lastMonth = new Date(today)
  lastMonth.setMonth(today.getMonth() - 1)

  localDateFrom.value = formatDateForInput(lastMonth)
  localDateTo.value = formatDateForInput(today)
  updateDateRange()
}

const setAllTime = () => {
  localDateFrom.value = ''
  localDateTo.value = ''
  updateDateRange()
}

const clearDates = () => {
  localDateFrom.value = ''
  localDateTo.value = ''
  updateDateRange()
}

// Helper function to format date for input (YYYY-MM-DD)
const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Active chart type classes
const isPercentActive = computed(() => statisticsStore.chartType === 'percent')
const isHoursActive = computed(() => statisticsStore.chartType === 'hours')

// View mode toggle
const toggleViewMode = (mode: 'daily' | 'records') => {
  statisticsStore.setChartViewMode(mode)
}

// Active view mode classes
const isDailyActive = computed(() => statisticsStore.chartViewMode === 'daily')
const isRecordsActive = computed(() => statisticsStore.chartViewMode === 'records')
</script>

<template>
  <GlassCard variant="default" class="p-4">
    <div class="space-y-4">
      <!-- View Mode Toggle -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <span class="text-sm font-medium text-gray-300">Деталізація:</span>
        <div class="flex gap-2">
          <Button
            :variant="isDailyActive ? 'secondary' : 'outline'"
            size="sm"
            @click="toggleViewMode('daily')"
            :class="isDailyActive ? 'border-accent-blue/50 bg-accent-blue/20' : ''"
          >
            По днях
          </Button>
          <Button
            :variant="isRecordsActive ? 'secondary' : 'outline'"
            size="sm"
            @click="toggleViewMode('records')"
            :class="isRecordsActive ? 'border-accent-blue/50 bg-accent-blue/20' : ''"
          >
            По оновленнях
          </Button>
        </div>
      </div>

      <!-- Chart Type Toggle -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <span class="text-sm font-medium text-gray-300">Відобразити:</span>
        <div class="flex gap-2">
          <Button
            :variant="isPercentActive ? 'secondary' : 'outline'"
            size="sm"
            @click="toggleChartType('percent')"
            :class="isPercentActive ? 'border-accent-blue/50 bg-accent-blue/20' : ''"
          >
            % зі світлом
          </Button>
          <Button
            :variant="isHoursActive ? 'secondary' : 'outline'"
            size="sm"
            @click="toggleChartType('hours')"
            :class="isHoursActive ? 'border-accent-blue/50 bg-accent-blue/20' : ''"
          >
            Годин зі світлом
          </Button>
        </div>
      </div>

      <!-- Date Range Controls -->
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="flex-1 flex items-center gap-2">
          <div class="relative flex-1">
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Calendar :size="16" />
            </div>
            <Input
              v-model="localDateFrom"
              type="date"
              placeholder="Від"
              class="pl-9"
              @change="updateDateRange"
            />
          </div>
          <span class="text-gray-400">—</span>
          <div class="relative flex-1">
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Calendar :size="16" />
            </div>
            <Input
              v-model="localDateTo"
              type="date"
              placeholder="До"
              class="pl-9"
              @change="updateDateRange"
            />
          </div>
        </div>

        <Button
          v-if="localDateFrom || localDateTo"
          variant="ghost"
          size="sm"
          @click="clearDates"
          class="text-gray-400 hover:text-white"
        >
          Скинути
        </Button>
      </div>

      <!-- Quick Presets -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <span class="text-sm font-medium text-gray-300">Швидкий вибір:</span>
        <div class="flex flex-wrap gap-2">
          <button
            @click="setLastWeek"
            class="px-3 py-1.5 text-xs font-medium rounded-full border border-white/10 bg-bg-secondary/50 text-gray-300 hover:bg-bg-elevated hover:text-white hover:border-accent-blue/30 transition-all duration-200"
          >
            Останній тиждень
          </button>
          <button
            @click="setLastMonth"
            class="px-3 py-1.5 text-xs font-medium rounded-full border border-white/10 bg-bg-secondary/50 text-gray-300 hover:bg-bg-elevated hover:text-white hover:border-accent-blue/30 transition-all duration-200"
          >
            Останній місяць
          </button>
          <button
            @click="setAllTime"
            class="px-3 py-1.5 text-xs font-medium rounded-full border border-white/10 bg-bg-secondary/50 text-gray-300 hover:bg-bg-elevated hover:text-white hover:border-accent-blue/30 transition-all duration-200"
          >
            Весь час
          </button>
        </div>
      </div>

      <!-- Weekend Filter -->
      <div class="pt-2 border-t border-white/10">
        <WeekendToggle />
      </div>
    </div>
  </GlassCard>
</template>
