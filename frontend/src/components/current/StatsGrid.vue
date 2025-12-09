<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { TrendingUp, TrendingDown, Minus, Percent } from 'lucide-vue-next'
import { GlassCard, AnimatedCounter } from '@/components/ui'
import type { Comparison } from '@/services/types'
import gsap from 'gsap'

interface Props {
  comparison: Comparison | null
}

const props = defineProps<Props>()

const cards = computed(() => {
  if (!props.comparison) {
    return [
      { label: 'Погіршилось', value: 0, icon: TrendingDown, color: 'red' },
      { label: 'Покращилось', value: 0, icon: TrendingUp, color: 'green' },
      { label: 'Без змін', value: 0, icon: Minus, color: 'gray' },
      { label: 'Загальний вплив', value: 0, icon: Percent, color: 'blue', suffix: '%' }
    ]
  }

  const summary = props.comparison.summary

  return [
    {
      label: 'Погіршилось',
      value: summary.groupsWithMoreOutage,
      icon: TrendingDown,
      color: 'red'
    },
    {
      label: 'Покращилось',
      value: summary.groupsWithLessOutage,
      icon: TrendingUp,
      color: 'green'
    },
    {
      label: 'Без змін',
      value: summary.groupsUnchanged,
      icon: Minus,
      color: 'gray'
    },
    {
      label: 'Загальний вплив',
      value: parseFloat(summary.overallImpactPercent),
      icon: Percent,
      color: 'blue',
      suffix: '%'
    }
  ]
})

const cardRefs = ref<HTMLElement[]>([])

const getColorClasses = (color: string) => {
  switch (color) {
    case 'red':
      return {
        icon: 'text-status-worse',
        glow: 'shadow-[0_0_20px_rgba(239,68,68,0.3)]'
      }
    case 'green':
      return {
        icon: 'text-status-better',
        glow: 'shadow-[0_0_20px_rgba(34,197,94,0.3)]'
      }
    case 'gray':
      return {
        icon: 'text-text-secondary',
        glow: 'shadow-[0_0_20px_rgba(156,163,175,0.2)]'
      }
    case 'blue':
      return {
        icon: 'text-accent-blue',
        glow: 'shadow-[0_0_20px_rgba(91,141,239,0.3)]'
      }
    default:
      return {
        icon: 'text-text-primary',
        glow: ''
      }
  }
}

onMounted(() => {
  // Staggered entrance animation
  gsap.from(cardRefs.value, {
    y: 20,
    opacity: 0,
    duration: 0.6,
    stagger: 0.1,
    ease: 'power2.out'
  })
})
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <GlassCard
      v-for="(card, index) in cards"
      :key="card.label"
      :ref="(el) => { if (el) cardRefs[index] = el as HTMLElement }"
      :class="[
        'p-6 transition-all duration-300',
        getColorClasses(card.color).glow
      ]"
      variant="strong"
      hover
    >
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="text-text-secondary text-sm font-medium mb-2">
            {{ card.label }}
          </div>
          <div class="text-4xl font-bold text-text-primary">
            <AnimatedCounter
              :value="card.value"
              :duration="1.2"
              :suffix="card.suffix || ''"
            />
          </div>
        </div>
        <div :class="['p-3 rounded-xl bg-bg-elevated/50', getColorClasses(card.color).icon]">
          <component :is="card.icon" :size="24" :stroke-width="2" />
        </div>
      </div>
    </GlassCard>
  </div>
</template>
