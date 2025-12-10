<script setup lang="ts">
import { computed } from 'vue'
import { Star, ArrowRight } from 'lucide-vue-next'
import { Button, ChangeBadge } from '@/components/ui'
import { useHistoryStore } from '@/stores/historyStore'
import { useMyGroup } from '@/composables/useMyGroup'
import { ALL_GROUPS, type GroupId, type HistorySummary } from '@/services/types'
import { storeToRefs } from 'pinia'
import { cn } from '@/lib/utils'

interface Props {
  summary: HistorySummary
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'select-group': [groupId: GroupId]
}>()

const historyStore = useHistoryStore()
const { selectedGroupId } = storeToRefs(historyStore)
const { isMyGroup } = useMyGroup()

// Format minutes as compact hours/minutes
const formatMinutes = (minutes: number): string => {
  if (minutes === 0) return '0хв'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}г ${m}хв`
  if (h > 0) return `${h}г`
  return `${m}хв`
}

// Get group button state with full data
const getGroupState = (groupId: GroupId) => {
  const groupSummary = props.summary.groupSummaries[groupId]
  const hasChanges = groupSummary && groupSummary.changeCount > 0
  const isSelected = selectedGroupId.value === groupId
  const isMine = isMyGroup(groupId)

  return {
    hasChanges,
    isSelected,
    isMine,
    changeCount: groupSummary?.changeCount ?? 0,
    netChange: groupSummary?.netChange ?? 0,
    initialMinutes: groupSummary?.initialMinutes ?? 0,
    finalMinutes: groupSummary?.finalMinutes ?? 0
  }
}

// Handle group selection
const selectGroup = (groupId: GroupId) => {
  historyStore.selectGroup(groupId)
  emit('select-group', groupId)
}

// Get button classes with color-coded backgrounds
const getButtonClasses = (groupId: GroupId) => {
  const state = getGroupState(groupId)

  return cn(
    'relative h-auto min-h-[5.5rem] flex flex-col items-center justify-center gap-1 p-3 transition-all',
    // Selected state takes priority
    state.isSelected
      ? 'bg-accent-blue/20 text-white border-accent-blue ring-2 ring-accent-blue shadow-lg'
      : state.hasChanges
        // Color-coded based on change direction
        ? state.netChange < 0
          ? 'bg-accent-green/10 border-accent-green/40 hover:bg-accent-green/15'
          : 'bg-accent-red/10 border-accent-red/40 hover:bg-accent-red/15'
        // No changes - dimmed
        : 'opacity-50 border-white/10 hover:opacity-75',
    // My group indicator (when not selected)
    state.isMine && !state.isSelected && 'ring-1 ring-accent-blue/50'
  )
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
    <Button
      v-for="groupId in ALL_GROUPS"
      :key="groupId"
      variant="outline"
      :class="getButtonClasses(groupId)"
      @click="selectGroup(groupId)"
    >
      <!-- Header: Group ID + Star -->
      <div class="flex items-center justify-center gap-1.5 w-full">
        <span class="text-lg font-bold">{{ groupId }}</span>
        <Star
          v-if="isMyGroup(groupId)"
          :size="14"
          :class="cn(
            'flex-shrink-0',
            selectedGroupId === groupId ? 'fill-white text-white' : 'fill-accent-blue text-accent-blue'
          )"
        />
      </div>

      <!-- Main: Change Badge showing net change -->
      <ChangeBadge
        v-if="getGroupState(groupId).hasChanges"
        :change="getGroupState(groupId).netChange"
        class="text-sm"
      />

      <!-- No changes indicator -->
      <span
        v-else
        class="text-xs text-white/50"
      >
        Без змін
      </span>

      <!-- Footer: Before → After (only if has changes) -->
      <div
        v-if="getGroupState(groupId).hasChanges"
        class="flex items-center gap-1 text-xs text-white/50"
      >
        <span>{{ formatMinutes(getGroupState(groupId).initialMinutes) }}</span>
        <ArrowRight :size="10" class="flex-shrink-0" />
        <span>{{ formatMinutes(getGroupState(groupId).finalMinutes) }}</span>
      </div>
    </Button>
  </div>
</template>
