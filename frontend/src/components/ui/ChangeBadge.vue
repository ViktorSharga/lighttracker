<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-vue-next'

interface Props {
  change: number // Change in minutes
  showIcon?: boolean
  compact?: boolean // Use short format (1г 30хв) vs (1 год 30 хв)
}

const props = withDefaults(defineProps<Props>(), {
  showIcon: true,
  compact: true,
})

const isPositive = computed(() => props.change > 0)
const isNegative = computed(() => props.change < 0)
const isNeutral = computed(() => props.change === 0)

const formattedChange = computed(() => {
  const absChange = Math.abs(props.change)
  const hours = Math.floor(absChange / 60)
  const minutes = absChange % 60

  const hourLabel = props.compact ? 'г' : ' год'
  const minLabel = props.compact ? 'хв' : ' хв'

  let parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}${hourLabel}`)
  }
  if (minutes > 0 || hours === 0) {
    parts.push(`${minutes}${minLabel}`)
  }

  return parts.join(' ')
})

const badgeClasses = computed(() =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold shadow-sm',
    isPositive && 'bg-accent-red/20 border border-accent-red/40 text-accent-red',
    isNegative && 'bg-accent-green/20 border border-accent-green/40 text-accent-green',
    isNeutral && 'bg-gray-500/20 border border-gray-500/30 text-gray-400'
  )
)

const icon = computed(() => {
  if (!props.showIcon) return null
  return isPositive ? TrendingUp : isNegative ? TrendingDown : null
})
</script>

<template>
  <span :class="badgeClasses">
    <component :is="icon" v-if="icon" class="h-3.5 w-3.5" />
    <span class="font-bold">{{ isPositive ? '+' : isNegative ? '-' : '' }}{{ formattedChange }}</span>
  </span>
</template>
