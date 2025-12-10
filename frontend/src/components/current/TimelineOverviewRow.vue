<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import type { GroupData, GroupId, Interval } from '@/services/types'
import { cn } from '@/lib/utils'

interface Props {
  groupId: GroupId
  groupData: GroupData | null
  isMyGroup?: boolean
  isSelected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isMyGroup: false,
  isSelected: false
})

const emit = defineEmits<{
  'select': []
}>()

// Convert HH:MM to percentage of day (0-100)
const timeToPercent = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)
  return ((hours * 60 + minutes) / (24 * 60)) * 100
}

// Convert interval to positioned segment
interface PositionedSegment {
  left: number
  width: number
}

const segments = computed<PositionedSegment[]>(() => {
  if (!props.groupData?.intervals) return []

  return props.groupData.intervals.map((interval: Interval) => {
    const startPercent = timeToPercent(interval.start)
    const endPercent = timeToPercent(interval.end)
    return {
      left: startPercent,
      width: endPercent - startPercent
    }
  })
})

const rowClasses = computed(() => cn(
  'flex items-center gap-3 py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-200',
  'hover:bg-white/5',
  props.isMyGroup && 'ring-1 ring-accent-blue/50',
  props.isSelected && 'bg-accent-blue/10 ring-2 ring-accent-blue'
))
</script>

<template>
  <div
    :class="rowClasses"
    :data-group="groupId"
    @click="emit('select')"
  >
    <!-- Group label -->
    <div class="w-10 flex items-center gap-1 flex-shrink-0">
      <span class="text-sm font-medium text-text-primary">{{ groupId }}</span>
      <Star
        v-if="isMyGroup"
        :size="12"
        class="fill-accent-blue text-accent-blue flex-shrink-0"
      />
    </div>

    <!-- Timeline bar -->
    <div class="flex-1 h-6 relative rounded overflow-hidden">
      <!-- Green background (power available) -->
      <div class="absolute inset-0 bg-green-500/70 rounded" />

      <!-- Red segments (outages) -->
      <div
        v-for="(segment, index) in segments"
        :key="index"
        class="absolute h-full bg-red-500/90 transition-all duration-300"
        :style="{
          left: `${segment.left}%`,
          width: `${segment.width}%`
        }"
      />

      <!-- My group highlight border -->
      <div
        v-if="isMyGroup"
        class="absolute inset-0 rounded ring-2 ring-accent-blue pointer-events-none"
      />
    </div>
  </div>
</template>
