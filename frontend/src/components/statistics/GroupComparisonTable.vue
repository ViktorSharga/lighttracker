<script setup lang="ts">
import { ref, computed } from 'vue'
import { Trophy, ArrowUpDown, TrendingUp, ArrowUp, ArrowDown, Minus } from 'lucide-vue-next'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  GlassCard,
  Badge
} from '@/components/ui'
import { useStatisticsStore } from '@/stores/statisticsStore'
import { useMyGroup } from '@/composables/useMyGroup'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import type { GroupComparisonData } from '@/services/types'

// Props
interface Props {
  groupComparison: Record<string, GroupComparisonData>
}

const props = defineProps<Props>()

// Stores
const statisticsStore = useStatisticsStore()
const uiStore = useUIStore()
const { myGroup } = useMyGroup()

// Check if we have time-of-day analysis data
const hasTimeOfDayData = computed(() => {
  return statisticsStore.timeOfDayAnalysis !== null
})

const weightedGroupComparison = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.weightedGroupComparison ?? {}
})

// Sorting - extend with weighted fields
type SortKey = 'groupId' | 'averageMinutes' | 'totalMinutes' | 'daysCount' | 'rank' | 'impactScore' | 'weightedRank'
type SortOrder = 'asc' | 'desc'

const sortKey = ref<SortKey>('rank')
const sortOrder = ref<SortOrder>('asc')

// Convert groupComparison object to sorted array with weighted data
const tableData = computed(() => {
  const data = Object.entries(props.groupComparison).map(([groupId, stats]) => {
    const weightedStats = weightedGroupComparison.value[groupId]
    return {
      groupId,
      rank: stats.rank,
      averageMinutes: stats.averageMinutes,
      totalMinutes: stats.totalMinutes,
      daysCount: stats.daysCount,
      // Weighted fields (may be undefined if no time-of-day data)
      impactScore: weightedStats?.impactScore ?? null,
      weightedRank: weightedStats?.weightedRank ?? null,
      weightedAverageMinutes: weightedStats?.weightedAverageMinutes ?? null
    }
  })

  // Sort data
  const sorted = [...data].sort((a, b) => {
    let aVal: string | number | null
    let bVal: string | number | null

    switch (sortKey.value) {
      case 'groupId':
        aVal = a.groupId
        bVal = b.groupId
        break
      case 'averageMinutes':
        aVal = a.averageMinutes
        bVal = b.averageMinutes
        break
      case 'totalMinutes':
        aVal = a.totalMinutes
        bVal = b.totalMinutes
        break
      case 'daysCount':
        aVal = a.daysCount
        bVal = b.daysCount
        break
      case 'impactScore':
        aVal = a.impactScore ?? 0
        bVal = b.impactScore ?? 0
        break
      case 'weightedRank':
        aVal = a.weightedRank ?? a.rank
        bVal = b.weightedRank ?? b.rank
        break
      case 'rank':
      default:
        aVal = a.rank
        bVal = b.rank
    }

    if (sortOrder.value === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
    }
  })

  return sorted
})

// Handle column header click for sorting
const handleSort = (key: SortKey) => {
  if (sortKey.value === key) {
    // Toggle order if same column
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    // Set new column with default ascending order
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

// Get rank badge classes
const getRankClasses = (rank: number): string => {
  switch (rank) {
    case 1:
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 2:
      return 'bg-gray-400/20 text-gray-300 border-gray-400/30'
    case 3:
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    default:
      return 'bg-bg-elevated border-white/20 text-white'
  }
}

// Get rank icon
const getRankIcon = (rank: number) => {
  if (rank <= 3) return Trophy
  return TrendingUp
}

// Check if row is my group
const isMyGroupRow = (groupId: string): boolean => {
  return myGroup.value === groupId
}

// Navigate to group history
const navigateToHistory = (groupId: string) => {
  uiStore.navigateToGroupHistory(groupId as any)
}

// Format minutes to hours and minutes
const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)

  if (hours === 0) {
    return `${mins} хв`
  } else if (mins === 0) {
    return `${hours} год`
  } else {
    return `${hours} год ${mins} хв`
  }
}

// Get impact score color classes (green = low impact, red = high impact)
const getImpactScoreClasses = (score: number): string => {
  if (score <= 30) return 'bg-accent-green/20 text-accent-green border-accent-green/30'
  if (score <= 60) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  if (score <= 80) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  return 'bg-accent-red/20 text-accent-red border-accent-red/30'
}

// Get rank difference indicator
const getRankDifference = (rawRank: number, weightedRank: number | null) => {
  if (weightedRank === null) return null
  const diff = rawRank - weightedRank
  if (diff > 0) return { direction: 'up', value: diff }
  if (diff < 0) return { direction: 'down', value: Math.abs(diff) }
  return { direction: 'same', value: 0 }
}

// Column definitions - base columns, impact columns added conditionally
const baseColumns = [
  { key: 'rank', label: '#', sortable: false },
  { key: 'groupId', label: 'Група', sortable: true },
  { key: 'averageMinutes', label: 'Середнє', sortable: true },
  { key: 'totalMinutes', label: 'Всього', sortable: true },
  { key: 'daysCount', label: 'Днів', sortable: true }
] as const

const impactColumns = [
  { key: 'impactScore', label: 'Вплив', sortable: true },
  { key: 'weightedRank', label: 'Зважений #', sortable: true }
] as const

const columns = computed(() => {
  if (hasTimeOfDayData.value) {
    return [...baseColumns, ...impactColumns]
  }
  return [...baseColumns]
})
</script>

<template>
  <GlassCard variant="default" class="overflow-hidden">
    <!-- Header -->
    <div class="p-4 border-b border-white/10">
      <div class="flex items-center gap-2">
        <Trophy :size="20" class="text-accent-blue" />
        <h2 class="text-lg font-semibold text-white">Порівняння груп</h2>
      </div>
      <p class="text-sm text-gray-400 mt-1">
        Рейтинг груп за середнім часом відключення
      </p>
    </div>

    <!-- Table -->
    <div class="relative overflow-auto max-h-[600px]">
      <Table>
        <TableHeader :sticky="true">
          <TableRow :hover="false">
            <TableHead
              v-for="col in columns"
              :key="col.key"
              :class="cn(
                col.sortable && 'cursor-pointer select-none hover:text-white transition-colors',
                col.key === 'rank' && 'w-16',
                col.key === 'groupId' && 'w-24'
              )"
              @click="col.sortable ? handleSort(col.key as SortKey) : null"
            >
              <div class="flex items-center gap-2">
                {{ col.label }}
                <ArrowUpDown
                  v-if="col.sortable"
                  :size="14"
                  :class="cn(
                    'transition-opacity',
                    sortKey === col.key ? 'opacity-100' : 'opacity-30'
                  )"
                />
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow
            v-for="row in tableData"
            :key="row.groupId"
            :class="cn(
              'cursor-pointer transition-all duration-200',
              isMyGroupRow(row.groupId) && 'bg-accent-blue/10 hover:bg-accent-blue/20',
              !isMyGroupRow(row.groupId) && 'hover:bg-white/5'
            )"
            @click="navigateToHistory(row.groupId)"
          >
            <!-- Rank -->
            <TableCell>
              <Badge
                :class="cn(
                  'inline-flex items-center gap-1.5 border',
                  getRankClasses(row.rank)
                )"
              >
                <component :is="getRankIcon(row.rank)" :size="12" />
                {{ row.rank }}
              </Badge>
            </TableCell>

            <!-- Group ID -->
            <TableCell>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-white">{{ row.groupId }}</span>
                <Badge
                  v-if="isMyGroupRow(row.groupId)"
                  variant="info"
                  class="text-xs"
                >
                  Моя
                </Badge>
              </div>
            </TableCell>

            <!-- Average Minutes -->
            <TableCell>
              <div class="font-medium text-white">
                {{ formatMinutes(row.averageMinutes) }}
              </div>
              <div class="text-xs text-gray-400">
                на день
              </div>
            </TableCell>

            <!-- Total Minutes -->
            <TableCell>
              <div class="font-medium text-white">
                {{ formatMinutes(row.totalMinutes) }}
              </div>
            </TableCell>

            <!-- Days Count -->
            <TableCell>
              <div class="font-medium text-white">
                {{ row.daysCount }}
              </div>
              <div class="text-xs text-gray-400">
                {{ row.daysCount === 1 ? 'день' : row.daysCount < 5 ? 'дні' : 'днів' }}
              </div>
            </TableCell>

            <!-- Impact Score (conditional) -->
            <TableCell v-if="hasTimeOfDayData && row.impactScore !== null">
              <Badge
                :class="cn(
                  'inline-flex items-center gap-1 border font-medium',
                  getImpactScoreClasses(row.impactScore)
                )"
              >
                {{ row.impactScore }}%
              </Badge>
            </TableCell>

            <!-- Weighted Rank (conditional) -->
            <TableCell v-if="hasTimeOfDayData && row.weightedRank !== null">
              <div class="flex items-center gap-2">
                <Badge
                  :class="cn(
                    'inline-flex items-center gap-1.5 border',
                    getRankClasses(row.weightedRank)
                  )"
                >
                  <component :is="getRankIcon(row.weightedRank)" :size="12" />
                  {{ row.weightedRank }}
                </Badge>
                <!-- Rank difference indicator -->
                <span
                  v-if="getRankDifference(row.rank, row.weightedRank)"
                  :class="cn(
                    'flex items-center gap-0.5 text-xs',
                    getRankDifference(row.rank, row.weightedRank)?.direction === 'up' && 'text-accent-green',
                    getRankDifference(row.rank, row.weightedRank)?.direction === 'down' && 'text-accent-red',
                    getRankDifference(row.rank, row.weightedRank)?.direction === 'same' && 'text-gray-400'
                  )"
                >
                  <ArrowUp v-if="getRankDifference(row.rank, row.weightedRank)?.direction === 'up'" :size="12" />
                  <ArrowDown v-else-if="getRankDifference(row.rank, row.weightedRank)?.direction === 'down'" :size="12" />
                  <Minus v-else :size="12" />
                  <span v-if="getRankDifference(row.rank, row.weightedRank)?.value">
                    {{ getRankDifference(row.rank, row.weightedRank)?.value }}
                  </span>
                </span>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Empty state -->
    <div
      v-if="tableData.length === 0"
      class="p-8 text-center text-gray-400"
    >
      <Trophy :size="48" class="mx-auto mb-4 opacity-30" />
      <p>Немає даних для відображення</p>
      <p class="text-sm mt-2">
        Оберіть період для порівняння груп
      </p>
    </div>

    <!-- Footer hint -->
    <div
      v-if="tableData.length > 0"
      class="p-3 border-t border-white/10 bg-bg-secondary/30 text-xs text-gray-400 text-center"
    >
      Натисніть на рядок, щоб переглянути історію групи
    </div>
  </GlassCard>
</template>
