<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  DateSelector,
  DaySummaryCard,
  GroupsGrid,
  ChangesTimeline,
  GroupHistoryDetail,
} from '@/components/history'
import { useHistory } from '@/composables/useHistory'
import { useHistoryStore } from '@/stores/historyStore'
import type { GroupId } from '@/services/types'

const { availableDates, selectedDate, summary, timeline, fetchDates } = useHistory()
const historyStore = useHistoryStore()

// Local state for selected group
const selectedGroupId = ref<GroupId | null>(null)

const handleGroupSelect = (groupId: GroupId | null) => {
  selectedGroupId.value = groupId
  historyStore.selectGroup(groupId)
}

onMounted(async () => {
  // Fetch available dates on mount
  await fetchDates()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Date Selector - Always at the top -->
    <DateSelector />

    <!-- Day Summary Card - Shows summary for selected date -->
    <DaySummaryCard v-if="summary" />

    <!-- Two-column layout for groups and timeline / detail -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left column: Groups Grid and Changes Timeline -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Groups Grid -->
        <div>
          <h2 class="text-xl font-semibold mb-4">Групи</h2>
          <GroupsGrid @select-group="handleGroupSelect" />
        </div>

        <!-- Changes Timeline -->
        <div>
          <h2 class="text-xl font-semibold mb-4">Хронологія змін</h2>
          <ChangesTimeline />
        </div>
      </div>

      <!-- Right column: Group History Detail -->
      <div class="lg:col-span-1">
        <GroupHistoryDetail
          v-if="selectedGroupId"
          :group-id="selectedGroupId"
          @close="handleGroupSelect(null)"
        />
      </div>
    </div>
  </div>
</template>
