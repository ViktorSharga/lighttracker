<script setup lang="ts">
import { computed } from 'vue'
import { Clock, RefreshCw, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import { GlassCard } from '@/components/ui'
import type { HistorySummary } from '@/services/types'

interface Props {
  summary: HistorySummary | null
}

const props = defineProps<Props>()

// Format time from ISO string to HH:MM
const formatTime = (isoString: string): string => {
  const date = new Date(isoString)
  return date.toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

// Formatted times
const firstUpdateTime = computed(() =>
  props.summary ? formatTime(props.summary.firstUpdate) : '--:--'
)

const lastUpdateTime = computed(() =>
  props.summary ? formatTime(props.summary.lastUpdate) : '--:--'
)

// Overall day assessment based on changes
const dayAssessment = computed(() => {
  if (!props.summary || props.summary.totalChanges === 0) {
    return {
      icon: Minus,
      text: 'Без змін',
      color: 'text-white/70',
      bgColor: 'bg-white/10'
    }
  }

  // Calculate overall trend from timeline
  const timeline = props.summary.changesTimeline
  if (timeline.length === 0) {
    return {
      icon: Minus,
      text: 'Без змін',
      color: 'text-white/70',
      bgColor: 'bg-white/10'
    }
  }

  // Check the last change to determine trend
  const lastChange = timeline[timeline.length - 1]
  const moreOutages = lastChange.summary.groupsWithMoreOutage
  const lessOutages = lastChange.summary.groupsWithLessOutage

  if (moreOutages > lessOutages) {
    return {
      icon: TrendingUp,
      text: 'Більше відключень',
      color: 'text-accent-red',
      bgColor: 'bg-accent-red/20'
    }
  } else if (lessOutages > moreOutages) {
    return {
      icon: TrendingDown,
      text: 'Менше відключень',
      color: 'text-accent-green',
      bgColor: 'bg-accent-green/20'
    }
  } else {
    return {
      icon: Minus,
      text: 'Змішаний результат',
      color: 'text-accent-blue',
      bgColor: 'bg-accent-blue/20'
    }
  }
})

// Format plural for Ukrainian
const getUpdateWord = (count: number): string => {
  const lastDigit = count % 10
  const lastTwoDigits = count % 100

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'оновлень'
  }
  if (lastDigit === 1) {
    return 'оновлення'
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'оновлення'
  }
  return 'оновлень'
}

const getChangeWord = (count: number): string => {
  const lastDigit = count % 10
  const lastTwoDigits = count % 100

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'змін'
  }
  if (lastDigit === 1) {
    return 'зміна'
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'зміни'
  }
  return 'змін'
}

// Change count color based on value
const changeCountColor = computed(() => {
  if (!props.summary) return 'text-white/70'

  const changes = props.summary.totalChanges
  if (changes === 0) return 'text-white/70'
  if (changes <= 2) return 'text-accent-green'
  if (changes <= 5) return 'text-accent-blue'
  return 'text-accent-red'
})
</script>

<template>
  <GlassCard
    v-if="summary"
    variant="highlight"
    class="p-6"
  >
    <h3 class="mb-4 flex items-center gap-2 text-sm font-medium text-white/60">
      <Activity class="h-4 w-4" />
      Підсумок дня
    </h3>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      <!-- Update Count -->
      <div class="flex items-start gap-3 rounded-lg bg-bg-primary/30 p-3">
        <div class="rounded-md bg-accent-blue/20 p-2">
          <RefreshCw class="h-4 w-4 text-accent-blue" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-white/60">Оновлень</p>
          <p class="mt-0.5 text-2xl font-bold text-white">
            {{ summary.updateCount }}
          </p>
          <p class="mt-0.5 text-xs text-white/50">
            {{ getUpdateWord(summary.updateCount) }}
          </p>
        </div>
      </div>

      <!-- Change Count -->
      <div class="flex items-start gap-3 rounded-lg bg-bg-primary/30 p-3">
        <div :class="['rounded-md p-2', changeCountColor === 'text-accent-green' ? 'bg-accent-green/20' : changeCountColor === 'text-accent-red' ? 'bg-accent-red/20' : 'bg-accent-blue/20']">
          <Activity :class="['h-4 w-4', changeCountColor]" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-white/60">Змін</p>
          <p :class="['mt-0.5 text-2xl font-bold', changeCountColor]">
            {{ summary.totalChanges }}
          </p>
          <p class="mt-0.5 text-xs text-white/50">
            {{ getChangeWord(summary.totalChanges) }}
          </p>
        </div>
      </div>

      <!-- First Update -->
      <div class="flex items-start gap-3 rounded-lg bg-bg-primary/30 p-3">
        <div class="rounded-md bg-white/10 p-2">
          <Clock class="h-4 w-4 text-white/70" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-white/60">Перше оновлення</p>
          <p class="mt-0.5 text-lg font-semibold text-white">
            {{ firstUpdateTime }}
          </p>
        </div>
      </div>

      <!-- Last Update -->
      <div class="flex items-start gap-3 rounded-lg bg-bg-primary/30 p-3">
        <div class="rounded-md bg-white/10 p-2">
          <Clock class="h-4 w-4 text-white/70" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-white/60">Останнє оновлення</p>
          <p class="mt-0.5 text-lg font-semibold text-white">
            {{ lastUpdateTime }}
          </p>
        </div>
      </div>
    </div>

    <!-- Overall Assessment -->
    <div class="mt-4 flex items-center gap-3 rounded-lg bg-bg-primary/30 p-4">
      <div :class="['rounded-full p-2', dayAssessment.bgColor]">
        <component
          :is="dayAssessment.icon"
          :class="['h-5 w-5', dayAssessment.color]"
        />
      </div>
      <div class="flex-1">
        <p class="text-xs text-white/60">Загальна оцінка</p>
        <p :class="['mt-0.5 text-lg font-semibold', dayAssessment.color]">
          {{ dayAssessment.text }}
        </p>
      </div>
    </div>
  </GlassCard>
</template>
