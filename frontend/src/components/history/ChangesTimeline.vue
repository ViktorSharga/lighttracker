<script setup lang="ts">
import { ref, computed } from 'vue'
import { useHistoryStore } from '@/stores/historyStore'
import TimelineEntry from './TimelineEntry.vue'
import { GlassCard } from '@/components/ui'
import { Clock } from 'lucide-vue-next'

const historyStore = useHistoryStore()

const timeline = computed(() => historyStore.changesTimeline)
const hasChanges = computed(() => timeline.value.length > 0)

const handleSelectGroup = (groupId: string) => {
  historyStore.selectGroup(groupId)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <Clock class="h-5 w-5 text-accent-blue" />
      <h2 class="text-xl font-bold text-text-primary">Хронологія змін</h2>
    </div>

    <!-- Timeline -->
    <div v-if="hasChanges" class="relative">
      <TimelineEntry
        v-for="(entry, index) in timeline"
        :key="`${entry.fromTimestamp}-${entry.toTimestamp}`"
        :entry="entry"
        :index="index"
        @select-group="handleSelectGroup"
      />
    </div>

    <!-- Empty state -->
    <GlassCard v-else class="p-8">
      <div class="text-center">
        <Clock class="h-12 w-12 text-text-secondary mx-auto mb-3 opacity-50" />
        <p class="text-text-secondary">
          Немає змін розкладу за цей день
        </p>
      </div>
    </GlassCard>
  </div>
</template>
