<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  hour: number
  minutesOff: number
  isCurrent: boolean
}

const props = defineProps<Props>()

const showTooltip = ref(false)

const percentOff = computed(() => (props.minutesOff / 60) * 100)

const barColor = computed(() => {
  const percent = percentOff.value
  if (percent === 0) return 'bg-gradient-to-r from-green-500/80 to-green-400/80'
  if (percent < 25) return 'bg-gradient-to-r from-yellow-500/80 to-yellow-400/80'
  if (percent < 50) return 'bg-gradient-to-r from-orange-500/80 to-orange-400/80'
  if (percent < 75) return 'bg-gradient-to-r from-red-500/80 to-red-400/80'
  return 'bg-gradient-to-r from-red-700/80 to-red-600/80'
})

const borderClass = computed(() =>
  props.isCurrent ? 'border-2 border-accent-blue animate-pulse' : 'border border-white/10'
)

const hourFormatted = computed(() =>
  props.hour.toString().padStart(2, '0') + ':00'
)

const tooltipText = computed(() => {
  if (props.minutesOff === 0) return 'Світло є'
  if (props.minutesOff === 60) return 'Без світла 60 хв'
  return `Без світла ${props.minutesOff} хв`
})
</script>

<template>
  <div class="relative">
    <div
      class="relative h-5 rounded-lg overflow-hidden backdrop-blur-sm transition-all duration-300"
      :class="[barColor, borderClass]"
      @mouseenter="showTooltip = true"
      @mouseleave="showTooltip = false"
    >
      <!-- Hour label overlay for key hours -->
      <div
        v-if="hour % 3 === 0"
        class="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white drop-shadow-lg z-10"
      >
        {{ hourFormatted }}
      </div>

      <!-- Tooltip -->
      <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showTooltip"
          class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-bg-elevated border border-white/20 rounded-lg text-sm text-text-primary whitespace-nowrap shadow-lg z-20 backdrop-blur-md"
        >
          <div class="font-semibold">{{ hourFormatted }}</div>
          <div class="text-text-secondary text-xs">{{ tooltipText }}</div>
          <!-- Tooltip arrow -->
          <div class="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
            <div class="border-8 border-transparent border-t-bg-elevated"></div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
