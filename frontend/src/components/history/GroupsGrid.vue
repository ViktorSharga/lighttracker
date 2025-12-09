<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import { Button, Badge } from '@/components/ui'
import { useHistoryStore } from '@/stores/historyStore'
import { useMyGroup } from '@/composables/useMyGroup'
import { ALL_GROUPS, type GroupId, type HistorySummary } from '@/services/types'
import { storeToRefs } from 'pinia'
import { cn } from '@/lib/utils'

interface Props {
  summary: HistorySummary
}

const props = defineProps<Props>()

const historyStore = useHistoryStore()
const { selectedGroupId } = storeToRefs(historyStore)
const { myGroup, isMyGroup } = useMyGroup()

// Get group button state
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
    netChange: groupSummary?.netChange ?? 0
  }
}

// Get badge variant based on net change
const getBadgeVariant = (netChange: number): 'destructive' | 'success' | 'default' => {
  if (netChange > 0) return 'destructive' // More outage = red
  if (netChange < 0) return 'success' // Less outage = green
  return 'default'
}

// Handle group selection
const selectGroup = (groupId: GroupId) => {
  historyStore.selectGroup(groupId)
}

// Get button classes
const getButtonClasses = (groupId: GroupId) => {
  const state = getGroupState(groupId)

  return cn(
    'relative h-auto min-h-[4rem] flex flex-col items-center justify-center gap-1.5 transition-all',
    state.isSelected
      ? 'bg-accent-blue text-white border-accent-blue shadow-lg scale-[1.02]'
      : state.isMine
        ? 'border-accent-blue border-2 hover:bg-accent-blue/10'
        : !state.hasChanges
          ? 'opacity-50 border-white/10 hover:opacity-75'
          : 'border-white/20 hover:border-white/30'
  )
}

// Change indicator dot
const getChangeIndicatorClass = (netChange: number) => {
  if (netChange > 0) return 'bg-accent-red'
  if (netChange < 0) return 'bg-accent-green'
  return 'bg-gray-400'
}
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    <Button
      v-for="groupId in ALL_GROUPS"
      :key="groupId"
      variant="outline"
      :class="getButtonClasses(groupId)"
      @click="selectGroup(groupId)"
    >
      <!-- My group star indicator -->
      <Star
        v-if="isMyGroup(groupId)"
        :size="14"
        :class="cn(
          'absolute top-1.5 right-1.5',
          selectedGroupId === groupId ? 'fill-white text-white' : 'fill-accent-blue text-accent-blue'
        )"
      />

      <!-- Group ID -->
      <span class="text-lg font-bold">
        {{ groupId }}
      </span>

      <!-- Change indicator and count -->
      <div
        v-if="getGroupState(groupId).hasChanges"
        class="flex items-center gap-1.5"
      >
        <!-- Change status dot -->
        <span
          :class="cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            getChangeIndicatorClass(getGroupState(groupId).netChange)
          )"
        />

        <!-- Change count badge -->
        <Badge
          :variant="getBadgeVariant(getGroupState(groupId).netChange)"
          class="text-xs px-1.5 py-0"
        >
          {{ getGroupState(groupId).changeCount }}
        </Badge>
      </div>

      <!-- No changes indicator -->
      <span
        v-else
        class="text-xs text-white/50"
      >
        Без змін
      </span>
    </Button>
  </div>
</template>
