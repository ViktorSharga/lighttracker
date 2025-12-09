<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { Calendar } from 'lucide-vue-next'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui'
import { useHistoryStore } from '@/stores/historyStore'
import { storeToRefs } from 'pinia'

const historyStore = useHistoryStore()
const { availableDates, selectedDateKey, isLoading } = storeToRefs(historyStore)

// Ukrainian day names
const dayNames: Record<number, string> = {
  0: 'Неділя',
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця",
  6: 'Субота'
}

// Format date for display: "01.12.2025 (Понеділок)"
const formatDateForDisplay = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  const dayName = dayNames[date.getDay()]
  return `${day}.${month}.${year} (${dayName})`
}

// Formatted dates for display
const formattedDates = computed(() => {
  return availableDates.value.map(dateKey => ({
    value: dateKey,
    label: formatDateForDisplay(dateKey)
  }))
})

// Current selected date value for the Select component
const currentValue = computed({
  get: () => selectedDateKey.value || '',
  set: (value: string) => {
    if (value && value !== selectedDateKey.value) {
      historyStore.selectDate(value)
    }
  }
})

// Auto-select most recent date on mount
onMounted(async () => {
  if (availableDates.value.length > 0 && !selectedDateKey.value) {
    // Dates are sorted descending, so first is most recent
    await historyStore.fetchHistory(availableDates.value[0])
  }
})

// Watch for changes in available dates (e.g., after fetching)
watch(availableDates, (newDates) => {
  if (newDates.length > 0 && !selectedDateKey.value) {
    historyStore.fetchHistory(newDates[0])
  }
})
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-bg-elevated/30 backdrop-blur-md p-4 shadow-glass">
    <div class="flex items-center gap-3">
      <!-- Calendar Icon -->
      <div class="flex-shrink-0 rounded-lg bg-accent-blue/20 p-2">
        <Calendar class="h-5 w-5 text-accent-blue" />
      </div>

      <!-- Date Selector -->
      <div class="flex-1">
        <label class="mb-1.5 block text-xs font-medium text-white/60">
          Оберіть дату
        </label>
        <Select
          v-model="currentValue"
          :disabled="isLoading || formattedDates.length === 0"
        >
          <SelectTrigger
            :placeholder="formattedDates.length === 0 ? 'Немає доступних дат' : 'Оберіть дату...'"
          />
          <SelectContent>
            <SelectItem
              v-for="date in formattedDates"
              :key="date.value"
              :value="date.value"
            >
              {{ date.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
</template>
