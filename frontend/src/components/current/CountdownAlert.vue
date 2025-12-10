<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CheckCircle } from 'lucide-vue-next'
import { GlassCard, AnimatedCounter } from '@/components/ui'
import { useCountdown } from '@/composables/useCountdown'
import { useMyGroup } from '@/composables/useMyGroup'
import { useScheduleStore } from '@/stores/scheduleStore'
import { storeToRefs } from 'pinia'

const { myGroup } = useMyGroup()
const scheduleStore = useScheduleStore()
const { current } = storeToRefs(scheduleStore)

// Get countdown data for user's selected group - called at setup time with refs
// The composable handles null values internally
const countdown = useCountdown(myGroup, current)

// Check if we should show the alert
const shouldShow = computed(() => {
  return myGroup.value !== null && current.value !== null
})

// Get countdown details - access computed values from the composable
const nextOutage = computed(() => countdown.nextOutage.value)
const isUrgent = computed(() => countdown.isUrgent.value)
const isCurrentlyOff = computed(() => nextOutage.value?.isCurrentlyOff ?? false)

// Parse countdown string to get hours and minutes for animated display
const countdownParts = computed(() => {
  if (!nextOutage.value) {
    return { hours: 0, minutes: 0 }
  }

  const minutesValue = isCurrentlyOff.value
    ? nextOutage.value.endsIn ?? 0
    : nextOutage.value.startsIn ?? 0

  const hours = Math.floor(minutesValue / 60)
  const minutes = minutesValue % 60

  return { hours, minutes }
})

// Status message
const statusMessage = computed(() => {
  if (!nextOutage.value || !nextOutage.value.start) {
    return 'Немає даних про розклад'
  }

  if (isCurrentlyOff.value) {
    return 'Зараз немає світла. Увімкнуть через'
  }

  if (nextOutage.value.startsIn !== null && nextOutage.value.startsIn > 0) {
    if (nextOutage.value.startsIn < 60) {
      return 'Відключення через'
    }
    // Don't say "через" if we're showing the safe status instead of countdown
    return null // Will be handled by the safe status block
  }

  return null
})

// Check if power is on and no upcoming outage soon
const isPowerOnAndSafe = computed(() => {
  return !isCurrentlyOff.value &&
         nextOutage.value?.startsIn !== null &&
         nextOutage.value.startsIn > 60
})
</script>

<template>
  <GlassCard
    v-if="shouldShow"
    :variant="isUrgent ? 'highlight' : 'default'"
    :class="[
      'p-6 transition-all duration-300',
      isUrgent && 'animate-urgentPulse',
      isPowerOnAndSafe && 'border-accent-green/30',
    ]"
  >
    <div class="flex items-start gap-4">
      <!-- Icon -->
      <div
        :class="[
          'flex-shrink-0 rounded-full p-3 transition-colors',
          isUrgent && 'bg-accent-red/20',
          isPowerOnAndSafe && 'bg-accent-green/20',
          !isUrgent && !isPowerOnAndSafe && 'bg-accent-yellow/20',
        ]"
      >
        <AlertTriangle
          v-if="isUrgent || isCurrentlyOff"
          :class="[
            'h-6 w-6',
            isUrgent && 'text-accent-red',
            isCurrentlyOff && !isUrgent && 'text-accent-yellow',
          ]"
        />
        <CheckCircle
          v-else
          class="h-6 w-6 text-accent-green"
        />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Group label -->
        <div class="mb-2 flex items-center gap-2">
          <span class="text-sm font-medium text-white/60">
            Група {{ myGroup }}
          </span>
        </div>

        <!-- Status message (only show if not in safe mode) -->
        <p
          v-if="statusMessage"
          :class="[
            'mb-3 text-lg font-medium',
            isUrgent && 'text-accent-red',
            !isUrgent && 'text-white',
          ]"
        >
          {{ statusMessage }}
        </p>

        <!-- Countdown display -->
        <div
          v-if="nextOutage?.start && !isPowerOnAndSafe"
          class="flex items-baseline gap-3"
        >
          <!-- Hours -->
          <div
            v-if="countdownParts.hours > 0"
            class="flex items-baseline gap-1"
          >
            <AnimatedCounter
              :value="countdownParts.hours"
              :duration="0.5"
              class="text-2xl sm:text-4xl font-bold tabular-nums text-white"
            />
            <span class="text-base sm:text-xl text-white/70">год</span>
          </div>

          <!-- Minutes -->
          <div class="flex items-baseline gap-1">
            <AnimatedCounter
              :value="countdownParts.minutes"
              :duration="0.5"
              class="text-2xl sm:text-4xl font-bold tabular-nums text-white"
            />
            <span class="text-base sm:text-xl text-white/70">хв</span>
          </div>
        </div>

        <!-- Safe status indicator -->
        <div
          v-else-if="isPowerOnAndSafe"
          class="flex items-center gap-2"
        >
          <span class="text-2xl font-semibold text-accent-green">
            Світло є
          </span>
          <span class="text-sm text-white/60">
            (наступне відключення о {{ nextOutage?.start }})
          </span>
        </div>
      </div>
    </div>
  </GlassCard>
</template>
