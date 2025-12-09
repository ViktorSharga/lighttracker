<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, Clock, Sun, CloudOff } from 'lucide-vue-next'
import { GlassCard, AnimatedCounter } from '@/components/ui'
import type { StatisticsSummary } from '@/services/types'

interface Props {
  summary: StatisticsSummary | null
}

const props = defineProps<Props>()

// Total days card
const totalDays = computed(() => props.summary?.totalDays ?? 0)

// Average outage card - extract hours and minutes for AnimatedCounter
const avgMinutes = computed(() => props.summary?.overallAverageOutage ?? 0)
const avgHours = computed(() => Math.floor(avgMinutes.value / 60))
const avgRemainingMinutes = computed(() => avgMinutes.value % 60)
const avgFormatted = computed(() => props.summary?.overallAverageFormatted ?? '0 хв')

// Best day card
const bestDate = computed(() => props.summary?.bestDay?.date ?? '-')
const bestFormatted = computed(() => props.summary?.bestDay?.formatted ?? '-')

// Worst day card
const worstDate = computed(() => props.summary?.worstDay?.date ?? '-')
const worstFormatted = computed(() => props.summary?.worstDay?.formatted ?? '-')

// Format date for display (from YYYY-MM-DD to DD.MM.YYYY)
const formatDate = (dateStr: string): string => {
  if (dateStr === '-') return '-'
  const [year, month, day] = dateStr.split('-')
  return `${day}.${month}.${year}`
}

const cards = computed(() => [
  {
    icon: Calendar,
    label: 'Всього днів',
    value: totalDays.value,
    displayValue: `${totalDays.value} днів`,
    color: 'blue',
    useCounter: true,
  },
  {
    icon: Clock,
    label: 'Середнє відключення',
    value: avgMinutes.value,
    displayValue: avgFormatted.value,
    subtitle: 'на день',
    color: 'yellow',
    useCounter: false, // Use formatted string instead
  },
  {
    icon: Sun,
    label: 'Найкращий день',
    value: formatDate(bestDate.value),
    displayValue: formatDate(bestDate.value),
    subtitle: bestFormatted.value,
    color: 'green',
    useCounter: false,
  },
  {
    icon: CloudOff,
    label: 'Найгірший день',
    value: formatDate(worstDate.value),
    displayValue: formatDate(worstDate.value),
    subtitle: worstFormatted.value,
    color: 'red',
    useCounter: false,
  },
])

// Color variants for cards
const colorClasses = {
  blue: {
    glow: 'shadow-[0_0_20px_rgba(91,141,239,0.2)]',
    icon: 'text-accent-blue',
    gradient: 'from-accent-blue/20 to-transparent',
  },
  yellow: {
    glow: 'shadow-[0_0_20px_rgba(251,191,36,0.2)]',
    icon: 'text-yellow-400',
    gradient: 'from-yellow-400/20 to-transparent',
  },
  green: {
    glow: 'shadow-[0_0_20px_rgba(34,197,94,0.2)]',
    icon: 'text-green-400',
    gradient: 'from-green-400/20 to-transparent',
  },
  red: {
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.2)]',
    icon: 'text-red-400',
    gradient: 'from-red-400/20 to-transparent',
  },
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    <GlassCard
      v-for="(card, index) in cards"
      :key="index"
      :glow="true"
      :hover="true"
      :class="[
        'p-6 relative overflow-hidden',
        colorClasses[card.color].glow,
      ]"
    >
      <!-- Background gradient -->
      <div
        :class="[
          'absolute inset-0 bg-gradient-to-br opacity-10',
          colorClasses[card.color].gradient,
        ]"
      />

      <!-- Content -->
      <div class="relative z-10">
        <!-- Icon and label -->
        <div class="flex items-center gap-3 mb-4">
          <div
            :class="[
              'p-2 rounded-lg bg-white/5 backdrop-blur-sm',
              colorClasses[card.color].icon,
            ]"
          >
            <component :is="card.icon" :size="24" :stroke-width="2" />
          </div>
          <span class="text-sm font-medium text-white/70">
            {{ card.label }}
          </span>
        </div>

        <!-- Value -->
        <div class="mb-2">
          <div
            v-if="card.useCounter && typeof card.value === 'number'"
            class="text-3xl font-bold text-white"
          >
            <AnimatedCounter
              :value="card.value"
              :duration="1.2"
              suffix=" днів"
            />
          </div>
          <div v-else class="text-3xl font-bold text-white">
            {{ card.displayValue }}
          </div>
        </div>

        <!-- Subtitle -->
        <div
          v-if="card.subtitle"
          class="text-sm text-white/60"
        >
          {{ card.subtitle }}
        </div>
      </div>
    </GlassCard>
  </div>
</template>
