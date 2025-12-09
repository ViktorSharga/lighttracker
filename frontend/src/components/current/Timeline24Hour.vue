<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { GlassCard } from '@/components/ui'
import { useTimelineData } from '@/composables/useTimelineData'
import type { GroupData } from '@/services/types'
import gsap from 'gsap'
import TimelineRow from './TimelineRow.vue'

interface Props {
  groupData: GroupData | null
}

const props = defineProps<Props>()

const { hourlyBreakdown } = useTimelineData(props.groupData)

const currentHour = ref(new Date().getHours())

const timelineRef = ref<HTMLElement | null>(null)

// Update current hour every minute
onMounted(() => {
  // Animate bars growing from 0 to final width
  const bars = timelineRef.value?.querySelectorAll('.timeline-bar')
  if (bars) {
    gsap.from(bars, {
      scaleX: 0,
      transformOrigin: 'left',
      duration: 0.8,
      stagger: 0.02,
      ease: 'power2.out',
      delay: 0.2
    })
  }

  // Update current hour periodically
  const interval = setInterval(() => {
    currentHour.value = new Date().getHours()
  }, 60000) // Update every minute

  return () => clearInterval(interval)
})
</script>

<template>
  <GlassCard variant="strong" class="p-6">
    <div class="mb-4">
      <h3 class="text-lg font-semibold text-text-primary">24-годинна шкала</h3>
      <p class="text-sm text-text-secondary mt-1">
        Відсутність світла по годинах (темніше = більше часу без світла)
      </p>
    </div>

    <div
      ref="timelineRef"
      class="space-y-1.5 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
    >
      <div
        v-for="item in hourlyBreakdown"
        :key="item.hour"
        class="timeline-bar"
      >
        <TimelineRow
          :hour="item.hour"
          :minutes-off="item.minutesOff"
          :is-current="item.hour === currentHour"
        />
      </div>
    </div>

    <!-- Legend -->
    <div class="mt-6 pt-4 border-t border-white/10">
      <div class="flex flex-wrap items-center gap-4 text-sm">
        <div class="flex items-center gap-2">
          <div class="w-8 h-3 rounded bg-gradient-to-r from-green-500 to-green-400"></div>
          <span class="text-text-secondary">Світло є</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-3 rounded bg-gradient-to-r from-yellow-500 to-yellow-400"></div>
          <span class="text-text-secondary">До 25%</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-3 rounded bg-gradient-to-r from-orange-500 to-orange-400"></div>
          <span class="text-text-secondary">25-50%</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-3 rounded bg-gradient-to-r from-red-500 to-red-400"></div>
          <span class="text-text-secondary">50-75%</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-3 rounded bg-gradient-to-r from-red-700 to-red-600"></div>
          <span class="text-text-secondary">75-100%</span>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2 text-sm">
        <div class="w-8 h-3 rounded border-2 border-accent-blue bg-green-500/80"></div>
        <span class="text-text-secondary">Поточна година (пульсує)</span>
      </div>
    </div>
  </GlassCard>
</template>

<style scoped>
/* Custom scrollbar */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
