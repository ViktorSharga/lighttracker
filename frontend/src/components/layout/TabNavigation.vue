<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { Calendar, Clock, BarChart3 } from 'lucide-vue-next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui'
import { useUIStore } from '@/stores/uiStore'
import { storeToRefs } from 'pinia'
import { gsap } from 'gsap'
import type { TabId } from '@/services/types'

// Store integration
const uiStore = useUIStore()
const { activeTab } = storeToRefs(uiStore)

// Tab configuration
const tabs = [
  { id: 'current' as TabId, label: 'Поточний графік', icon: Calendar },
  { id: 'history' as TabId, label: 'Історія', icon: Clock },
  { id: 'statistics' as TabId, label: 'Статистика', icon: BarChart3 },
]

// Refs for animation
const tabsListRef = ref<HTMLElement | null>(null)
const indicatorRef = ref<HTMLDivElement | null>(null)

// Update active tab in store
const handleTabChange = (value: string) => {
  uiStore.setActiveTab(value as TabId)
}

// Animate underline indicator to match active tab
const animateIndicator = async () => {
  await nextTick()

  if (!tabsListRef.value || !indicatorRef.value) return

  const activeButton = tabsListRef.value.querySelector('[data-state="active"]')
  if (!activeButton) return

  const buttonRect = activeButton.getBoundingClientRect()
  const listRect = tabsListRef.value.getBoundingClientRect()

  const left = buttonRect.left - listRect.left
  const width = buttonRect.width

  gsap.to(indicatorRef.value, {
    x: left,
    width: width,
    duration: 0.3,
    ease: 'power2.out',
  })
}

// Watch for tab changes to trigger indicator animation
watch(activeTab, () => {
  animateIndicator()
})

// Initialize indicator position on mount with retry
const initIndicator = () => {
  if (!tabsListRef.value || !indicatorRef.value) return false

  const activeButton = tabsListRef.value.querySelector('[data-state="active"]')
  if (!activeButton) return false

  const buttonRect = activeButton.getBoundingClientRect()
  const listRect = tabsListRef.value.getBoundingClientRect()

  // Make sure we have valid dimensions
  if (buttonRect.width === 0 || listRect.width === 0) return false

  const left = buttonRect.left - listRect.left
  const width = buttonRect.width

  // GSAP controls both position and visibility
  gsap.set(indicatorRef.value, {
    x: left,
    width: width,
    opacity: 1,
  })

  return true
}

onMounted(async () => {
  await nextTick()

  // Try to initialize immediately
  if (initIndicator()) return

  // If failed, retry with delays (Radix may not have set data-state yet)
  const retryDelays = [50, 100, 200, 500]
  for (const delay of retryDelays) {
    await new Promise(resolve => setTimeout(resolve, delay))
    if (initIndicator()) return
  }
})
</script>

<template>
  <div class="w-full">
    <Tabs
      :model-value="activeTab"
      @update:model-value="handleTabChange"
      class="w-full"
    >
      <div class="relative" ref="tabsListRef">
        <TabsList class="w-full justify-start md:justify-center relative">
          <TabsTrigger
            v-for="tab in tabs"
            :key="tab.id"
            :value="tab.id"
            class="flex items-center gap-2 min-h-[44px] px-4 md:px-6 touch-manipulation"
          >
            <component
              :is="tab.icon"
              class="h-5 w-5 flex-shrink-0"
            />
            <span class="hidden sm:inline font-medium">
              {{ tab.label }}
            </span>
          </TabsTrigger>

          <!-- Animated underline indicator (hidden until positioned by GSAP) -->
          <div
            ref="indicatorRef"
            class="absolute bottom-0 left-0 h-0.5 bg-accent-blue rounded-full pointer-events-none"
            style="opacity: 0; width: 0px;"
          />
        </TabsList>
      </div>
    </Tabs>
  </div>
</template>

<style scoped>
/* Ensure smooth touch interactions on mobile */
@media (hover: none) and (pointer: coarse) {
  .touch-manipulation {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
}
</style>
