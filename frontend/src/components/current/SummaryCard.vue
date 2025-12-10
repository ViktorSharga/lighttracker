<script setup lang="ts">
import { computed } from 'vue'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import { GlassCard } from '@/components/ui'
import type { Comparison } from '@/services/types'

interface Props {
  comparison: Comparison | null
}

const props = defineProps<Props>()

// Determine if there are any changes
const hasChanges = computed(() => props.comparison?.hasChanges ?? false)

// Get the summary data
const summary = computed(() => props.comparison?.summary)

// Parse the total change to get hours and minutes
const totalChangeParts = computed(() => {
  if (!summary.value) {
    return { hours: 0, minutes: 0, isNegative: false }
  }

  const totalMinutes = Math.abs(summary.value.totalMinutesChange)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const isNegative = summary.value.totalMinutesChange < 0

  return { hours, minutes, isNegative }
})

// Determine status: worse (more outage), better (less outage), or unchanged
const changeStatus = computed(() => {
  if (!hasChanges.value || !summary.value) {
    return 'unchanged'
  }

  return summary.value.totalMinutesChange > 0 ? 'worse' : 'better'
})

// Status message
const statusMessage = computed(() => {
  if (!hasChanges.value) {
    return 'Без змін'
  }

  const parts = totalChangeParts.value
  const changeText: string[] = []

  if (parts.hours > 0) {
    changeText.push(`${parts.hours} год`)
  }
  if (parts.minutes > 0) {
    changeText.push(`${parts.minutes} хв`)
  }

  const timeText = changeText.join(' ')
  const direction = parts.isNegative ? 'менше' : 'більше'

  return `Загалом ${timeText} ${direction} без світла`
})

// Icon component based on status
const statusIcon = computed(() => {
  if (changeStatus.value === 'worse') return TrendingUp
  if (changeStatus.value === 'better') return TrendingDown
  return Minus
})

// Color classes based on status
const statusColorClass = computed(() => {
  if (changeStatus.value === 'worse') return 'text-accent-red'
  if (changeStatus.value === 'better') return 'text-accent-green'
  return 'text-white/70'
})

const borderColorClass = computed(() => {
  if (changeStatus.value === 'worse') return 'border-accent-red/30'
  if (changeStatus.value === 'better') return 'border-accent-green/30'
  return 'border-white/10'
})

const bgGradientClass = computed(() => {
  if (changeStatus.value === 'worse') {
    return 'bg-gradient-to-br from-accent-red/10 to-transparent'
  }
  if (changeStatus.value === 'better') {
    return 'bg-gradient-to-br from-accent-green/10 to-transparent'
  }
  return ''
})
</script>

<template>
  <GlassCard
    v-if="comparison"
    :class="[
      'relative overflow-hidden p-6 transition-all duration-300',
      borderColorClass,
    ]"
  >
    <!-- Animated gradient background -->
    <div
      :class="[
        'absolute inset-0 opacity-50 transition-opacity duration-500',
        bgGradientClass,
        hasChanges && 'animate-pulse',
      ]"
      style="animation-duration: 3s"
    />

    <!-- Content -->
    <div class="relative z-10">
      <div class="flex items-start gap-4">
        <!-- Icon -->
        <div
          :class="[
            'flex-shrink-0 rounded-full p-3 transition-colors',
            changeStatus === 'worse' && 'bg-accent-red/20',
            changeStatus === 'better' && 'bg-accent-green/20',
            changeStatus === 'unchanged' && 'bg-white/10',
          ]"
        >
          <component
            :is="statusIcon"
            :class="['h-6 w-6', statusColorClass]"
          />
        </div>

        <!-- Message -->
        <div class="flex-1 min-w-0">
          <h3 class="mb-2 text-sm font-medium text-white/60">
            Порівняння з попереднім розкладом
          </h3>

          <!-- Main summary message with gradient text effect -->
          <p
            :class="[
              'text-xl sm:text-2xl font-bold leading-tight',
              statusColorClass,
              hasChanges && 'bg-gradient-to-r bg-clip-text',
              changeStatus === 'worse' && 'from-accent-red via-accent-red/80 to-accent-red',
              changeStatus === 'better' && 'from-accent-green via-accent-green/80 to-accent-green',
            ]"
          >
            {{ statusMessage }}
          </p>

          <!-- Additional stats for changed schedules -->
          <div
            v-if="hasChanges && summary"
            class="mt-4 flex flex-wrap gap-4 text-sm"
          >
            <div
              v-if="summary.groupsWithMoreOutage > 0"
              class="flex items-center gap-1"
            >
              <TrendingUp class="h-4 w-4 text-accent-red/70" />
              <span class="text-white/60">
                {{ summary.groupsWithMoreOutage }} груп(и) гірше
              </span>
            </div>

            <div
              v-if="summary.groupsWithLessOutage > 0"
              class="flex items-center gap-1"
            >
              <TrendingDown class="h-4 w-4 text-accent-green/70" />
              <span class="text-white/60">
                {{ summary.groupsWithLessOutage }} груп(и) краще
              </span>
            </div>

            <div
              v-if="summary.groupsUnchanged > 0"
              class="flex items-center gap-1"
            >
              <Minus class="h-4 w-4 text-white/50" />
              <span class="text-white/60">
                {{ summary.groupsUnchanged }} без змін
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </GlassCard>
</template>
