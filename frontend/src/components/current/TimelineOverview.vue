<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { GlassCard } from '@/components/ui'
import TimelineOverviewRow from './TimelineOverviewRow.vue'
import { useMyGroup } from '@/composables/useMyGroup'
import { ALL_GROUPS, type GroupId, type Schedule } from '@/services/types'
import gsap from 'gsap'

interface Props {
  schedule: Schedule
}

defineProps<Props>()

const emit = defineEmits<{
  'select-group': [groupId: GroupId]
}>()

const { myGroup } = useMyGroup()

const containerRef = ref<HTMLElement | null>(null)

// Animate rows on mount
onMounted(async () => {
  // Wait for Vue to finish rendering all elements
  await nextTick()

  const rows = containerRef.value?.querySelectorAll('[data-group]')
  if (rows && rows.length > 0) {
    // Set final state first to ensure visibility
    gsap.set(rows, { opacity: 1, x: 0 })
    // Then animate from invisible
    gsap.from(rows, {
      opacity: 0,
      x: -20,
      duration: 0.4,
      stagger: 0.03,
      ease: 'power2.out'
    })
  }
})
</script>

<template>
  <GlassCard variant="strong" class="p-6">
    <div class="mb-4">
      <h3 class="text-lg font-semibold text-text-primary">Огляд на 24 години</h3>
      <p class="text-sm text-text-secondary mt-1">
        Натисніть на групу для детального перегляду
      </p>
    </div>

    <!-- All groups timeline -->
    <div ref="containerRef" class="space-y-1">
      <TimelineOverviewRow
        v-for="groupId in ALL_GROUPS"
        :key="groupId"
        :group-id="groupId"
        :group-data="schedule.groups[groupId]"
        :is-my-group="myGroup === groupId"
        @select="emit('select-group', groupId)"
      />
    </div>

    <!-- Time axis -->
    <div class="flex justify-between text-xs text-text-secondary mt-4 px-12">
      <span>00:00</span>
      <span>06:00</span>
      <span>12:00</span>
      <span>18:00</span>
      <span>24:00</span>
    </div>

    <!-- Minimal legend -->
    <div class="mt-4 pt-4 border-t border-white/10">
      <div class="flex items-center gap-6 text-sm">
        <div class="flex items-center gap-2">
          <div class="w-6 h-3 rounded bg-green-500/70"></div>
          <span class="text-text-secondary">Світло є</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-6 h-3 rounded bg-red-500/90"></div>
          <span class="text-text-secondary">Без світла</span>
        </div>
      </div>
    </div>
  </GlassCard>
</template>
