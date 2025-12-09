<script setup lang="ts">
import { onMounted } from 'vue'
import {
  CountdownAlert,
  SummaryCard,
  StatsGrid,
  Timeline24Hour,
  GroupCardsGrid,
} from '@/components/current'
import { useSchedule } from '@/composables/useSchedule'
import { useMyGroup } from '@/composables/useMyGroup'

const { schedule, previous, comparison, refresh, autoRefresh } = useSchedule()
const { myGroup, myGroupData } = useMyGroup()

onMounted(async () => {
  // Fetch schedule on mount
  await refresh()

  // Start auto-refresh every 30 seconds
  autoRefresh(30000)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Countdown Alert - Only shown if user has selected their group -->
    <CountdownAlert v-if="myGroup && myGroupData" />

    <!-- Summary Card - Only shown if comparison exists -->
    <SummaryCard v-if="comparison" :comparison="comparison" />

    <!-- Stats Grid - Shows comparison statistics -->
    <StatsGrid v-if="comparison" :comparison="comparison" />

    <!-- My Group Timeline - Only shown if user has selected their group -->
    <div v-if="myGroup && myGroupData">
      <h2 class="text-xl font-semibold mb-4">Моя група</h2>
      <Timeline24Hour :group-data="myGroupData" />
    </div>

    <!-- All Groups Grid -->
    <div>
      <h2 class="text-xl font-semibold mb-4">Всі групи</h2>
      <GroupCardsGrid
        v-if="schedule"
        :schedule="schedule"
        :previous-schedule="previous"
        :comparison="comparison"
      />
    </div>
  </div>
</template>
