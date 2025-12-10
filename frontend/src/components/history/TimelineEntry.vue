<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { Clock, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { GlassCard, ChangeBadge } from '@/components/ui'
import type { ChangeTimelineEntry } from '@/services/types'
import { cn } from '@/lib/utils'
import gsap from 'gsap'

interface Props {
  entry: ChangeTimelineEntry
  index: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  selectGroup: [groupId: string]
}>()

const isExpanded = ref(false)
const entryRef = ref<HTMLElement | null>(null)
const detailsRef = ref<HTMLElement | null>(null)

const formattedTime = computed(() => {
  const date = new Date(props.entry.toTimestamp)
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
})

const isPositiveChange = computed(() => props.entry.summary.totalMinutesChange > 0)

const affectedGroupsCount = computed(() => {
  return Object.keys(props.entry.groupChanges).length
})

const sortedGroupChanges = computed(() => {
  return Object.entries(props.entry.groupChanges)
    .sort(([a], [b]) => {
      const [aQueue, aSubgroup] = a.split('.').map(Number)
      const [bQueue, bSubgroup] = b.split('.').map(Number)
      if (aQueue !== bQueue) return aQueue - bQueue
      return aSubgroup - bSubgroup
    })
})

const toggleExpand = async () => {
  isExpanded.value = !isExpanded.value

  // Wait for DOM to update before animating (element uses v-if)
  await nextTick()

  if (isExpanded.value && detailsRef.value) {
    gsap.fromTo(
      detailsRef.value,
      { height: 0, opacity: 0 },
      { height: 'auto', opacity: 1, duration: 0.3, ease: 'power2.out' }
    )
  }
}

const handleGroupClick = (groupId: string) => {
  emit('selectGroup', groupId)
}

onMounted(() => {
  if (entryRef.value) {
    gsap.fromTo(
      entryRef.value,
      { opacity: 0, x: -20 },
      {
        opacity: 1,
        x: 0,
        duration: 0.4,
        delay: props.index * 0.1,
        ease: 'power2.out'
      }
    )
  }
})
</script>

<template>
  <div ref="entryRef" class="relative pl-8 pb-8 last:pb-0">
    <!-- Timeline connector -->
    <div
      class="absolute left-2 top-6 bottom-0 w-0.5"
      :class="isPositiveChange ? 'bg-accent-red/30' : 'bg-accent-green/30'"
    />

    <!-- Timeline dot -->
    <div
      class="absolute left-0 top-4 w-4 h-4 rounded-full border-2"
      :class="[
        isPositiveChange
          ? 'bg-accent-red border-accent-red/50'
          : 'bg-accent-green border-accent-green/50',
        'shadow-lg'
      ]"
    />

    <!-- Entry card -->
    <GlassCard
      :variant="isPositiveChange ? 'default' : 'default'"
      :hover="true"
      class="cursor-pointer transition-all"
      @click="toggleExpand"
    >
      <div class="p-4">
        <!-- Header -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2 text-text-secondary">
            <Clock class="h-4 w-4" />
            <span class="text-sm font-medium">{{ formattedTime }}</span>
          </div>

          <div class="flex items-center gap-2">
            <ChangeBadge :change="entry.summary.totalMinutesChange" />
            <component
              :is="isExpanded ? ChevronUp : ChevronDown"
              class="h-4 w-4 text-text-secondary transition-transform"
            />
          </div>
        </div>

        <!-- Summary -->
        <div class="mb-2">
          <p class="text-text-primary font-medium">
            {{ entry.summary.humanReadable }}
          </p>
        </div>

        <!-- Quick stats -->
        <div class="flex items-center gap-4 text-xs text-text-secondary">
          <span>{{ affectedGroupsCount }} груп змінено</span>
          <span v-if="entry.summary.groupsWithMoreOutage > 0" class="text-accent-red">
            {{ entry.summary.groupsWithMoreOutage }} гірше
          </span>
          <span v-if="entry.summary.groupsWithLessOutage > 0" class="text-accent-green">
            {{ entry.summary.groupsWithLessOutage }} краще
          </span>
        </div>
      </div>

      <!-- Expandable details -->
      <div
        v-if="isExpanded"
        ref="detailsRef"
        class="border-t border-white/10 px-4 py-3 overflow-hidden"
      >
        <h4 class="text-sm font-semibold text-text-primary mb-3">Зміни по групах:</h4>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          <button
            v-for="[groupId, change] in sortedGroupChanges"
            :key="groupId"
            @click.stop="handleGroupClick(groupId)"
            class="group flex items-center justify-between gap-2 p-2 rounded-lg border transition-all hover:-translate-y-0.5"
            :class="[
              change.status === 'worse'
                ? 'border-accent-red/30 bg-accent-red/5 hover:bg-accent-red/10 hover:border-accent-red/50'
                : change.status === 'better'
                ? 'border-accent-green/30 bg-accent-green/5 hover:bg-accent-green/10 hover:border-accent-green/50'
                : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
            ]"
          >
            <span
              class="text-xs font-bold"
              :class="change.status === 'worse' ? 'text-accent-red' : change.status === 'better' ? 'text-accent-green' : 'text-text-secondary'"
            >
              {{ groupId }}
            </span>
            <span
              class="text-xs font-semibold"
              :class="change.status === 'worse' ? 'text-accent-red' : change.status === 'better' ? 'text-accent-green' : 'text-text-secondary'"
            >
              {{ change.diffFormatted }}
            </span>
          </button>
        </div>
      </div>
    </GlassCard>
  </div>
</template>
