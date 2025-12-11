<script setup lang="ts">
import { computed, ref } from 'vue'
import { Scale, TrendingUp, TrendingDown, Minus, HelpCircle, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { GlassCard, Badge } from '@/components/ui'
import { useStatisticsStore } from '@/stores/statisticsStore'
import { cn } from '@/lib/utils'

const statisticsStore = useStatisticsStore()

// Help section state
const showHelp = ref(false)

const fairnessMetrics = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.fairnessMetrics ?? null
})

const weekendDaysExcluded = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.weekendDaysExcluded ?? 0
})

const excludeWeekends = computed(() => {
  return statisticsStore.timeOfDayAnalysis?.excludeWeekends ?? false
})

// Get score color classes
const getScoreColorClasses = (score: number): string => {
  if (score >= 80) return 'text-accent-green bg-accent-green/20 border-accent-green/30'
  if (score >= 60) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30'
  if (score >= 40) return 'text-orange-400 bg-orange-500/20 border-orange-500/30'
  return 'text-accent-red bg-accent-red/20 border-accent-red/30'
}

// Get score interpretation
const getScoreInterpretation = (score: number): string => {
  if (score >= 80) return 'Рівномірний розподіл'
  if (score >= 60) return 'Помірно рівномірний'
  if (score >= 40) return 'Нерівномірний розподіл'
  return 'Дуже нерівномірний'
}

// Get trend icon
const getTrendIcon = (rawCv: number, weightedCv: number) => {
  const diff = weightedCv - rawCv
  if (Math.abs(diff) < 1) return Minus
  return diff > 0 ? TrendingUp : TrendingDown
}

// Format coefficient of variation
const formatCv = (cv: number): string => {
  return `${cv.toFixed(1)}%`
}

// Format minutes
const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0 && mins > 0) return `${hours} год ${mins} хв`
  if (hours > 0) return `${hours} год`
  return `${mins} хв`
}
</script>

<template>
  <GlassCard variant="default" class="overflow-hidden">
    <!-- Header -->
    <div class="p-4 border-b border-white/10">
      <div class="flex items-center gap-2">
        <Scale :size="20" class="text-accent-blue" />
        <h2 class="text-lg font-semibold text-white">Справедливість розподілу</h2>
      </div>
      <p class="text-sm text-gray-400 mt-1">
        Наскільки рівномірно розподілені відключення між групами
      </p>
    </div>

    <div v-if="fairnessMetrics" class="p-4 space-y-6">
      <!-- Main Scores -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Raw Fairness Score -->
        <div class="text-center">
          <div class="text-xs text-gray-400 mb-2">Базовий показник</div>
          <div
            :class="cn(
              'inline-flex items-center justify-center w-20 h-20 rounded-full border-2 text-2xl font-bold',
              getScoreColorClasses(fairnessMetrics.fairnessScore)
            )"
          >
            {{ fairnessMetrics.fairnessScore }}
          </div>
          <div class="text-xs text-gray-400 mt-2">
            {{ getScoreInterpretation(fairnessMetrics.fairnessScore) }}
          </div>
        </div>

        <!-- Weighted Fairness Score -->
        <div class="text-center">
          <div class="text-xs text-gray-400 mb-2">Зважений показник</div>
          <div
            :class="cn(
              'inline-flex items-center justify-center w-20 h-20 rounded-full border-2 text-2xl font-bold',
              getScoreColorClasses(fairnessMetrics.weightedFairnessScore)
            )"
          >
            {{ fairnessMetrics.weightedFairnessScore }}
          </div>
          <div class="text-xs text-gray-400 mt-2">
            {{ getScoreInterpretation(fairnessMetrics.weightedFairnessScore) }}
          </div>
        </div>
      </div>

      <!-- Detailed Metrics -->
      <div class="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
        <!-- Raw Stats -->
        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-400 uppercase tracking-wide">Базова статистика</div>
          <div class="space-y-1.5">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Середнє:</span>
              <span class="text-white font-medium">{{ formatMinutes(fairnessMetrics.raw.mean) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Відхилення:</span>
              <span class="text-white font-medium">{{ formatMinutes(fairnessMetrics.raw.stdDev) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Коеф. варіації:</span>
              <span class="text-white font-medium">{{ formatCv(fairnessMetrics.raw.coefficientOfVariation) }}</span>
            </div>
          </div>
        </div>

        <!-- Weighted Stats -->
        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-400 uppercase tracking-wide">Зважена статистика</div>
          <div class="space-y-1.5">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Середнє:</span>
              <span class="text-white font-medium">{{ formatMinutes(fairnessMetrics.weighted.mean) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Відхилення:</span>
              <span class="text-white font-medium">{{ formatMinutes(fairnessMetrics.weighted.stdDev) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Коеф. варіації:</span>
              <span class="text-white font-medium">{{ formatCv(fairnessMetrics.weighted.coefficientOfVariation) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Weekend filter info -->
      <div v-if="excludeWeekends" class="pt-4 border-t border-white/10">
        <Badge variant="info" class="text-xs">
          Виключено {{ weekendDaysExcluded }} вихідних днів
        </Badge>
      </div>

      <!-- How to Read Section -->
      <div class="pt-4 border-t border-white/10">
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
            <p>Оцінити, чи справедливо розподілені відключення електроенергії між 12 групами. Ідеально — коли всі групи мають однаковий час без світла.</p>
          </div>

          <div>
            <div class="font-medium text-gray-300 mb-1">📊 Показник справедливості (0-100)</div>
            <ul class="list-disc list-inside space-y-1 text-xs">
              <li><span class="text-accent-green">80-100</span> — відмінно, групи мають приблизно однаковий час відключень</li>
              <li><span class="text-yellow-400">60-79</span> — добре, є незначні відмінності</li>
              <li><span class="text-orange-400">40-59</span> — проблематично, деякі групи страждають більше</li>
              <li><span class="text-accent-red">0-39</span> — несправедливо, великі відмінності між групами</li>
            </ul>
          </div>

          <div>
            <div class="font-medium text-gray-300 mb-1">⚖️ Базовий vs Зважений</div>
            <p><strong>Базовий</strong> — рахує всі хвилини однаково.<br>
            <strong>Зважений</strong> — враховує, що відключення ввечері (17:00-22:00) гірше, ніж вночі (00:00-06:00).</p>
          </div>

          <div>
            <div class="font-medium text-gray-300 mb-1">📈 Коефіцієнт варіації</div>
            <p>Показує розкид значень у відсотках. Менше = краще. Наприклад, 5% означає, що групи відрізняються максимум на ~5% від середнього.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!fairnessMetrics" class="p-8 text-center text-gray-400">
      <Scale :size="48" class="mx-auto mb-4 opacity-30" />
      <p>Немає даних для аналізу справедливості</p>
    </div>
  </GlassCard>
</template>
