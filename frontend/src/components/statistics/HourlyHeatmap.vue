<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clock, HelpCircle, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { GlassCard } from '@/components/ui'
import { useStatisticsStore } from '@/stores/statisticsStore'
import { useMyGroup } from '@/composables/useMyGroup'
import { cn } from '@/lib/utils'

const statisticsStore = useStatisticsStore()
const { myGroup } = useMyGroup()

// Help section state
const showHelp = ref(false)

// Tooltip state
const hoveredCell = ref<{ groupIndex: number; hour: number } | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })

const heatmapData = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.hourlyHeatmap ?? null
})

const timeSlots = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.timeSlots ?? []
})

// Get color based on minutes (green = 0, red = max)
const getCellColor = (minutes: number, maxValue: number): string => {
  if (maxValue === 0) return 'bg-accent-green/20'
  const ratio = minutes / maxValue

  if (ratio === 0) return 'bg-gray-800/50'
  if (ratio <= 0.25) return 'bg-accent-green/30'
  if (ratio <= 0.5) return 'bg-yellow-500/30'
  if (ratio <= 0.75) return 'bg-orange-500/40'
  return 'bg-accent-red/50'
}

// Get text color based on intensity
const getTextColor = (minutes: number, maxValue: number): string => {
  if (maxValue === 0) return 'text-gray-500'
  const ratio = minutes / maxValue

  if (ratio === 0) return 'text-gray-500'
  if (ratio <= 0.25) return 'text-accent-green'
  if (ratio <= 0.5) return 'text-yellow-400'
  if (ratio <= 0.75) return 'text-orange-400'
  return 'text-accent-red'
}

// Check if hour is in a specific time slot for border styling
const getTimeSlotBorder = (hour: number): string => {
  for (const slot of timeSlots.value) {
    if (hour === slot.startHour) {
      return 'border-l-2 border-l-white/30'
    }
  }
  return ''
}

// Handle mouse enter for tooltip
const handleMouseEnter = (event: MouseEvent, groupIndex: number, hour: number) => {
  hoveredCell.value = { groupIndex, hour }
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  tooltipPosition.value = {
    x: rect.left + rect.width / 2,
    y: rect.top - 10
  }
}

// Handle mouse leave
const handleMouseLeave = () => {
  hoveredCell.value = null
}

// Get tooltip content
const getTooltipContent = computed(() => {
  if (!hoveredCell.value || !heatmapData.value) return null
  const { groupIndex, hour } = hoveredCell.value
  const groupId = heatmapData.value.groups[groupIndex]
  const minutes = heatmapData.value.data[groupIndex][hour]

  // Find time slot for this hour
  let slotLabel = ''
  for (const slot of timeSlots.value) {
    if (hour >= slot.startHour && hour < slot.endHour) {
      slotLabel = slot.label
      break
    }
  }

  return {
    groupId,
    hour: `${hour.toString().padStart(2, '0')}:00`,
    minutes,
    slotLabel
  }
})

// Check if group is my group
const isMyGroup = (groupId: string): boolean => {
  return myGroup.value === groupId
}
</script>

<template>
  <GlassCard variant="default" class="overflow-hidden">
    <!-- Header -->
    <div class="p-4 border-b border-white/10">
      <div class="flex items-center gap-2">
        <Clock :size="20" class="text-accent-blue" />
        <h2 class="text-lg font-semibold text-white">Теплова карта відключень</h2>
      </div>
      <p class="text-sm text-gray-400 mt-1">
        Середній час відключення по годинах (хвилин на день)
      </p>
    </div>

    <!-- Heatmap Grid -->
    <div class="p-4 overflow-x-auto" v-if="heatmapData">
      <div class="min-w-[800px]">
        <!-- Hour headers -->
        <div class="flex ml-16 mb-2">
          <div
            v-for="hour in heatmapData.hours"
            :key="hour"
            :class="cn(
              'w-8 text-center text-xs text-gray-400',
              getTimeSlotBorder(hour)
            )"
          >
            {{ hour.toString().padStart(2, '0') }}
          </div>
        </div>

        <!-- Rows -->
        <div
          v-for="(groupId, groupIndex) in heatmapData.groups"
          :key="groupId"
          class="flex items-center mb-1"
        >
          <!-- Group label -->
          <div
            :class="cn(
              'w-16 pr-2 text-right text-sm font-medium',
              isMyGroup(groupId) ? 'text-accent-blue' : 'text-gray-300'
            )"
          >
            {{ groupId }}
            <span v-if="isMyGroup(groupId)" class="text-xs ml-1">(Моя)</span>
          </div>

          <!-- Cells -->
          <div class="flex">
            <div
              v-for="hour in heatmapData.hours"
              :key="hour"
              :class="cn(
                'w-8 h-7 flex items-center justify-center text-xs font-medium rounded-sm transition-all duration-150 cursor-default',
                getCellColor(heatmapData.data[groupIndex][hour], heatmapData.maxValue),
                getTextColor(heatmapData.data[groupIndex][hour], heatmapData.maxValue),
                getTimeSlotBorder(hour),
                isMyGroup(groupId) && 'ring-1 ring-accent-blue/30',
                'hover:ring-2 hover:ring-white/50'
              )"
              @mouseenter="(e) => handleMouseEnter(e, groupIndex, hour)"
              @mouseleave="handleMouseLeave"
            >
              {{ heatmapData.data[groupIndex][hour] > 0 ? heatmapData.data[groupIndex][hour] : '' }}
            </div>
          </div>
        </div>

        <!-- Time slot legend -->
        <div class="flex ml-16 mt-4 gap-2 flex-wrap">
          <div
            v-for="slot in timeSlots"
            :key="slot.id"
            class="flex items-center gap-1.5 text-xs"
          >
            <div
              class="w-3 h-3 rounded"
              :style="{ backgroundColor: slot.color }"
            />
            <span class="text-gray-300">{{ slot.label }}</span>
            <span class="text-gray-500">({{ slot.weight }}x)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Color scale legend -->
    <div class="px-4 pb-4" v-if="heatmapData">
      <div class="flex items-center justify-center gap-2 text-xs text-gray-400">
        <span>Менше</span>
        <div class="flex">
          <div class="w-6 h-4 bg-gray-800/50 rounded-l"></div>
          <div class="w-6 h-4 bg-accent-green/30"></div>
          <div class="w-6 h-4 bg-yellow-500/30"></div>
          <div class="w-6 h-4 bg-orange-500/40"></div>
          <div class="w-6 h-4 bg-accent-red/50 rounded-r"></div>
        </div>
        <span>Більше</span>
      </div>
    </div>

    <!-- How to Read Section -->
    <div class="px-4 pb-4 border-t border-white/10 pt-4" v-if="heatmapData">
      <button
        @click="showHelp = !showHelp"
        class="w-full flex items-center justify-between text-left text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
      >
        <span class="flex items-center gap-2">
          <HelpCircle :size="16" />
          Як читати цю візуалізацію?
        </span>
        <component :is="showHelp ? ChevronUp : ChevronDown" :size="16" />
      </button>

      <div v-show="showHelp" class="mt-3 space-y-3 text-sm text-gray-400">
        <div>
          <div class="font-medium text-gray-300 mb-1">🎯 Мета</div>
          <p>Побачити, в які години доби найчастіше відбуваються відключення для кожної групи. Це допомагає зрозуміти, чи деякі групи страждають більше у "критичний" час.</p>
        </div>

        <div>
          <div class="font-medium text-gray-300 mb-1">📖 Як читати</div>
          <ul class="list-disc list-inside space-y-1 text-xs">
            <li><strong>Рядки</strong> — групи (1.1-6.2)</li>
            <li><strong>Стовпці</strong> — години доби (00:00-23:00)</li>
            <li><strong>Число в клітинці</strong> — середня кількість хвилин без світла в цю годину</li>
            <li><strong>Колір</strong> — інтенсивність (червоніше = більше відключень)</li>
          </ul>
        </div>

        <div>
          <div class="font-medium text-gray-300 mb-1">🔍 На що звертати увагу</div>
          <ul class="list-disc list-inside space-y-1 text-xs">
            <li>Порівняйте свою групу з іншими в однакові години</li>
            <li>Чи є групи з червоними клітинками у вечірній час (17:00-22:00)?</li>
            <li>Чи рівномірно розподілені відключення, чи деякі групи "везучі"?</li>
          </ul>
        </div>

        <div>
          <div class="font-medium text-gray-300 mb-1">⏰ Часові слоти</div>
          <p>Вертикальні лінії розділяють періоди: Ніч, Ранок, День, Вечір, Пізній вечір. Вечірні години (17-22) найбільш критичні для людей.</p>
        </div>
      </div>
    </div>

    <!-- Tooltip -->
    <Teleport to="body">
      <div
        v-if="hoveredCell && getTooltipContent"
        class="fixed z-50 px-3 py-2 text-sm bg-bg-elevated border border-white/20 rounded-lg shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full"
        :style="{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }"
      >
        <div class="text-white font-medium">Група {{ getTooltipContent.groupId }}</div>
        <div class="text-gray-300">{{ getTooltipContent.hour }} — {{ getTooltipContent.slotLabel }}</div>
        <div class="text-accent-blue font-medium">{{ getTooltipContent.minutes }} хв</div>
      </div>
    </Teleport>

    <!-- Empty state -->
    <div v-if="!heatmapData" class="p-8 text-center text-gray-400">
      <Clock :size="48" class="mx-auto mb-4 opacity-30" />
      <p>Немає даних для теплової карти</p>
    </div>
  </GlassCard>
</template>
