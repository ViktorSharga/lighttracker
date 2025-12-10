<script setup lang="ts">
import { computed, onMounted, nextTick, ref } from 'vue'
import gsap from 'gsap'
import GroupCard from './GroupCard.vue'
import { useMyGroup } from '@/composables/useMyGroup'
import { useUIStore } from '@/stores/uiStore'
import { ALL_GROUPS, type Schedule, type Comparison, type GroupId } from '@/services/types'

interface Props {
  schedule: Schedule
  previousSchedule: Schedule | null
  comparison: Comparison | null
}

const props = defineProps<Props>()

const { myGroup } = useMyGroup()
const uiStore = useUIStore()
const containerRef = ref<HTMLElement | null>(null)

// Sort groups so my group appears first if set
const sortedGroups = computed<GroupId[]>(() => {
  if (!myGroup.value) {
    return [...ALL_GROUPS]
  }

  const groups = [...ALL_GROUPS]
  const myGroupIndex = groups.indexOf(myGroup.value)

  if (myGroupIndex > -1) {
    groups.splice(myGroupIndex, 1)
    groups.unshift(myGroup.value)
  }

  return groups
})

// Handle card click to navigate to history
const handleCardClick = (groupId: GroupId) => {
  uiStore.navigateToGroupHistory(groupId)
}

// Animate cards on mount
onMounted(async () => {
  // Wait for DOM to be fully updated
  await nextTick()

  // Use gsap.fromTo to ensure final state is always applied
  // Scope query to container ref to avoid affecting other components
  setTimeout(() => {
    const cards = containerRef.value?.querySelectorAll('.group-card')
    if (cards && cards.length > 0) {
      gsap.fromTo(cards,
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          stagger: 0.05,
          ease: 'power2.out'
        }
      )
    }
  }, 50)
})
</script>

<template>
  <div ref="containerRef" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
    <GroupCard
      v-for="groupId in sortedGroups"
      :key="groupId"
      :group-id="groupId"
      :group-data="schedule.groups[groupId]"
      :previous-data="previousSchedule?.groups[groupId] ?? null"
      :change-data="comparison?.groupChanges[groupId] ?? null"
      @click="handleCardClick(groupId)"
    />
  </div>
</template>
