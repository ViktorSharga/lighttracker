<script setup lang="ts">
import { computed, ref } from 'vue'
import { PieChart, HelpCircle, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { GlassCard } from '@/components/ui'
import { useStatisticsStore } from '@/stores/statisticsStore'
import { useMyGroup } from '@/composables/useMyGroup'
import { cn } from '@/lib/utils'
import { ALL_GROUPS } from '@/services/types'

const statisticsStore = useStatisticsStore()
const { myGroup } = useMyGroup()

// Help section state
const showHelp = ref(false)

const timeSlotDistribution = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.timeSlotDistribution ?? null
})

const timeSlots = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.timeSlots ?? []
})

// Get slot data for a group
const getSlotData = (groupId: string) => {
  const distribution = timeSlotDistribution.value?.[groupId]
  if (!distribution) return []

  return timeSlots.value.map(slot => ({
    id: slot.id,
    label: slot.label,
    color: slot.color,
    weight: slot.weight,
    percentage: distribution[slot.id as keyof typeof distribution]?.percentage ?? 0,
    minutes: distribution[slot.id as keyof typeof distribution]?.minutes ?? 0
  }))
}

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
        <PieChart :size="20" class="text-accent-blue" />
        <h2 class="text-lg font-semibold text-white">Розподіл по часу доби</h2>
      </div>
      <p class="text-sm text-gray-400 mt-1">
        Відсоток відключень у кожному часовому слоті
      </p>
    </div>

    <!-- Legend -->
    <div class="px-4 pt-4 flex flex-wrap gap-3" v-if="timeSlots.length > 0">
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

    <!-- Distribution Bars -->
    <div class="p-4 space-y-3" v-if="timeSlotDistribution">
      <div
        v-for="groupId in ALL_GROUPS"
        :key="groupId"
        :class="cn(
          'flex items-center gap-3',
          isMyGroup(groupId) && 'bg-accent-blue/10 -mx-2 px-2 py-1 rounded'
        )"
      >
        <!-- Group label -->
        <div
          :class="cn(
            'w-12 text-sm font-medium shrink-0',
            isMyGroup(groupId) ? 'text-accent-blue' : 'text-gray-300'
          )"
        >
          {{ groupId }}
        </div>

        <!-- Stacked bar -->
        <div class="flex-1 h-6 flex rounded overflow-hidden bg-bg-elevated">
          <div
            v-for="slot in getSlotData(groupId)"
            :key="slot.id"
            class="h-full flex items-center justify-center text-[10px] font-medium text-white/90 transition-all duration-300 hover:brightness-110"
            :style="{
              width: `${slot.percentage}%`,
              backgroundColor: slot.color,
              minWidth: slot.percentage > 0 ? '1px' : '0'
            }"
            :title="`${slot.label}: ${slot.percentage.toFixed(1)}% (${slot.minutes} хв)`"
          >
            <span v-if="slot.percentage >= 10">{{ Math.round(slot.percentage) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Info about weights -->
    <div class="px-4 pb-4" v-if="timeSlotDistribution">
      <div class="text-xs text-gray-500 text-center">
        Множник показує вагу часового слоту при розрахунку зваженого впливу
      </div>
    </div>

    <!-- How to Read Section -->
    <div class="px-4 pb-4 border-t border-white/10 pt-4" v-if="timeSlotDistribution">
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
          <p>Порівняти, як розподілені відключення між часовими слотами для кожної групи. Це показує, чи одні групи "везучі" (більше відключень вночі), а інші — ні.</p>
        </div>

        <div>
          <div class="font-medium text-gray-300 mb-1">📖 Як читати</div>
          <ul class="list-disc list-inside space-y-1 text-xs">
            <li>Кожна горизонтальна смужка — одна група</li>
            <li>Кольори показують частку часу у кожному слоті</li>
            <li>Числа — відсоток від загального часу відключень</li>
          </ul>
        </div>

        <div>
          <div class="font-medium text-gray-300 mb-1">⚖️ Ваги часових слотів</div>
          <ul class="list-disc list-inside space-y-1 text-xs">
            <li><span class="inline-block w-3 h-3 rounded mr-1" style="background-color: #6366f1"></span><strong>Ніч (0.3x)</strong> — люди сплять, найменший вплив</li>
            <li><span class="inline-block w-3 h-3 rounded mr-1" style="background-color: #f59e0b"></span><strong>Ранок (1.0x)</strong> — збори на роботу</li>
            <li><span class="inline-block w-3 h-3 rounded mr-1" style="background-color: #3b82f6"></span><strong>День (0.8x)</strong> — багато на роботі</li>
            <li><span class="inline-block w-3 h-3 rounded mr-1" style="background-color: #ef4444"></span><strong>Вечір (1.5x)</strong> — пік навантаження, найгірший час</li>
            <li><span class="inline-block w-3 h-3 rounded mr-1" style="background-color: #8b5cf6"></span><strong>Пізній вечір (0.5x)</strong> — люди лягають спати</li>
          </ul>
        </div>

        <div>
          <div class="font-medium text-gray-300 mb-1">🔍 На що звертати увагу</div>
          <p>Якщо група має багато <span class="text-red-400">червоного</span> (вечір) — їй найгірше. Якщо багато <span class="text-indigo-400">синього</span> (ніч) — їй "пощастило". Справедливий розподіл — коли всі групи мають схожі пропорції.</p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!timeSlotDistribution" class="p-8 text-center text-gray-400">
      <PieChart :size="48" class="mx-auto mb-4 opacity-30" />
      <p>Немає даних для розподілу</p>
    </div>
  </GlassCard>
</template>
