<script setup lang="ts">
import { onMounted } from 'vue'
import {
  StatsSummaryCards,
  ChartControls,
  OutageChart,
  ComparisonDateRange,
  GroupComparisonTable,
} from '@/components/statistics'
import { useStatistics } from '@/composables/useStatistics'

const {
  statistics,
  chartData,
  groupRankings,
  chartType,
  fetchStats,
  setChartDateRange,
  setComparisonDateRange,
  setChartType,
} = useStatistics()

onMounted(async () => {
  // Fetch statistics on mount
  await fetchStats()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Summary Cards - Top row showing key metrics -->
    <StatsSummaryCards v-if="statistics" :summary="statistics.summary" />

    <!-- Chart Section -->
    <div class="space-y-4">
      <h2 class="text-xl font-semibold">Тенденції відключень</h2>

      <!-- Chart Controls - Date range and chart type selector -->
      <ChartControls />

      <!-- Outage Chart - Visualization of outage data -->
      <OutageChart v-if="chartData" />
    </div>

    <!-- Group Comparison Section -->
    <div class="space-y-4">
      <h2 class="text-xl font-semibold">Порівняння груп</h2>

      <!-- Comparison Date Range - Separate date range for comparison table -->
      <ComparisonDateRange />

      <!-- Group Comparison Table - Rankings and statistics -->
      <GroupComparisonTable
        v-if="statistics?.groupComparison"
        :group-comparison="statistics.groupComparison"
      />
    </div>
  </div>
</template>
