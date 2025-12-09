<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { X, ArrowRight, TrendingUp, TrendingDown } from 'lucide-vue-next'
import { GlassCard, ChangeBadge, Button } from '@/components/ui'
import { useHistoryStore } from '@/stores/historyStore'
import type { GroupId, GroupSummary } from '@/services/types'
import { cn } from '@/lib/utils'
import gsap from 'gsap'

const historyStore = useHistoryStore()

const detailRef = ref<HTMLElement | null>(null)
const changesListRef = ref<HTMLElement | null>(null)

const groupId = computed(() => historyStore.selectedGroupId)
const history = computed(() => historyStore.selectedGroupHistory)

const hasHistory = computed(() => history.value !== null)

const sortedChanges = computed(() => {
  if (!history.value) return []
  return [...history.value.changes].sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  })
})

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
}

const handleClose = () => {
  historyStore.selectGroup(null)
}

// Animate entry
watch(hasHistory, (newVal) => {
  if (newVal && detailRef.value) {
    gsap.fromTo(
      detailRef.value,
      { opacity: 0, x: 20 },
      { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' }
    )

    if (changesListRef.value) {
      const changeItems = changesListRef.value.querySelectorAll('.change-item')
      gsap.fromTo(
        changeItems,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.05,
          delay: 0.2,
          ease: 'power2.out'
        }
      )
    }
  }
})
</script>

<template>
  <div v-if="hasHistory && history && groupId" ref="detailRef" class="space-y-4">
    <GlassCard variant="highlight" class="overflow-hidden">
      <!-- Header -->
      <div class="p-4 border-b border-white/10">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-bold text-text-primary">
            Група {{ groupId }}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            @click="handleClose"
            class="text-text-secondary hover:text-text-primary"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>

        <!-- Net change summary -->
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <p class="text-xs text-text-secondary mb-1">Загальна зміна за день</p>
            <div class="flex items-center gap-2">
              <ChangeBadge :change="history.netChange" />
              <span class="text-xs text-text-secondary">
                ({{ history.changeCount }} {{ history.changeCount === 1 ? 'зміна' : history.changeCount < 5 ? 'зміни' : 'змін' }})
              </span>
            </div>
          </div>

          <div class="text-right">
            <p class="text-xs text-text-secondary mb-1">Підсумок</p>
            <div class="flex items-center gap-1">
              <span class="text-sm text-text-secondary">
                {{ Math.floor(history.initialMinutes / 60) }}h {{ history.initialMinutes % 60 }}m
              </span>
              <ArrowRight class="h-3 w-3 text-text-secondary" />
              <span
                class="text-sm font-semibold"
                :class="[
                  history.finalMinutes > history.initialMinutes
                    ? 'text-accent-red'
                    : history.finalMinutes < history.initialMinutes
                    ? 'text-accent-green'
                    : 'text-text-primary'
                ]"
              >
                {{ Math.floor(history.finalMinutes / 60) }}h {{ history.finalMinutes % 60 }}m
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Changes list -->
      <div ref="changesListRef" class="p-4 space-y-3 max-h-96 overflow-y-auto">
        <div
          v-for="(change, index) in sortedChanges"
          :key="`${change.timestamp}-${index}`"
          class="change-item group"
        >
          <div
            class="flex items-center gap-3 p-3 rounded-lg border transition-all"
            :class="[
              change.diff > 0
                ? 'border-accent-red/30 bg-accent-red/5 hover:bg-accent-red/10'
                : change.diff < 0
                ? 'border-accent-green/30 bg-accent-green/5 hover:bg-accent-green/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            ]"
          >
            <!-- Time -->
            <div class="flex-shrink-0">
              <div
                class="flex items-center justify-center w-12 h-12 rounded-lg"
                :class="[
                  change.diff > 0
                    ? 'bg-accent-red/20 text-accent-red'
                    : change.diff < 0
                    ? 'bg-accent-green/20 text-accent-green'
                    : 'bg-white/10 text-text-secondary'
                ]"
              >
                <span class="text-xs font-bold">
                  {{ formatTime(change.timestamp) }}
                </span>
              </div>
            </div>

            <!-- Change details -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <ChangeBadge :change="change.diff" />
              </div>

              <!-- From/To intervals -->
              <div class="flex items-center gap-2 text-xs">
                <span class="text-text-secondary truncate max-w-[120px]" :title="change.from">
                  {{ change.from || 'Немає відключень' }}
                </span>
                <ArrowRight class="h-3 w-3 text-text-secondary flex-shrink-0" />
                <span
                  class="truncate max-w-[120px] font-medium"
                  :class="[
                    change.diff > 0
                      ? 'text-accent-red'
                      : change.diff < 0
                      ? 'text-accent-green'
                      : 'text-text-secondary'
                  ]"
                  :title="change.to"
                >
                  {{ change.to || 'Немає відключень' }}
                </span>
              </div>
            </div>

            <!-- Change icon -->
            <div class="flex-shrink-0">
              <component
                :is="change.diff > 0 ? TrendingUp : change.diff < 0 ? TrendingDown : null"
                v-if="change.diff !== 0"
                class="h-5 w-5"
                :class="[
                  change.diff > 0 ? 'text-accent-red' : 'text-accent-green'
                ]"
              />
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  </div>
</template>
