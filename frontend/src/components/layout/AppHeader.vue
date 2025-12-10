<script setup lang="ts">
import { computed } from 'vue'
import { Zap, RefreshCw } from 'lucide-vue-next'
import { Button, Badge, Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useUIStore } from '@/stores/uiStore'
import { ALL_GROUPS, type GroupId } from '@/services/types'

const preferencesStore = usePreferencesStore()
const scheduleStore = useScheduleStore()
const uiStore = useUIStore()

const selectedGroup = computed({
  get: () => preferencesStore.myGroup ?? 'none',
  set: (value: string) => {
    preferencesStore.setMyGroup(value === 'none' ? null : value as GroupId)
  }
})

const isRefreshing = computed(() => scheduleStore.isFetching || scheduleStore.isLoading)

const handleRefresh = async () => {
  if (isRefreshing.value) return

  try {
    await scheduleStore.forceFetch()
  } catch (error) {
    console.error('Failed to refresh:', error)
  }
}
</script>

<template>
  <header class="app-header glass sticky top-0 z-50 border-b border-white/5">
    <div class="app-header-container">
      <!-- Logo Section -->
      <div class="logo-section">
        <div class="logo-icon">
          <Zap class="h-6 w-6 text-accent-blue" :stroke-width="2.5" />
        </div>
        <div class="logo-text">
          <h1 class="logo-title">LightTracker</h1>
          <Badge v-if="uiStore.version" variant="info" class="version-badge">
            v{{ uiStore.version }}
          </Badge>
        </div>
      </div>

      <!-- Controls Section -->
      <div class="controls-section">
        <!-- My Group Selector -->
        <div class="group-selector">
          <Select v-model="selectedGroup">
            <SelectTrigger placeholder="Моя черга" class="select-trigger" />
            <SelectContent>
              <SelectItem value="none">
                Не вибрано
              </SelectItem>
              <SelectItem
                v-for="group in ALL_GROUPS"
                :key="group"
                :value="group"
              >
                Черга {{ group }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Refresh Button -->
        <Button
          size="md"
          variant="default"
          :disabled="isRefreshing"
          @click="handleRefresh"
          class="refresh-button"
        >
          <RefreshCw
            class="h-4 w-4"
            :class="{ 'animate-spin': isRefreshing }"
          />
          <span class="refresh-text">Оновити зараз</span>
        </Button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.app-header-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

/* Logo Section */
.logo-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(145deg, rgba(91, 141, 239, 0.15), rgba(91, 141, 239, 0.05));
  box-shadow: 0 2px 8px rgba(91, 141, 239, 0.2);
  transition: all 0.3s ease;
}

.logo-icon:hover {
  box-shadow: 0 4px 16px rgba(91, 141, 239, 0.4);
  transform: translateY(-1px);
}

.logo-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
}

.version-badge {
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
}

/* Controls Section */
.controls-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.group-selector {
  min-width: 160px;
}

.select-trigger {
  height: 40px;
  font-size: 0.875rem;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 40px;
  padding: 0 1rem;
  white-space: nowrap;
}

.refresh-text {
  font-size: 0.875rem;
  font-weight: 500;
}

/* Responsive Design */
@media (max-width: 768px) {
  .app-header-container {
    height: 56px;
    padding: 0 1rem;
    gap: 0.75rem;
  }

  .logo-icon {
    width: 36px;
    height: 36px;
  }

  .logo-title {
    display: none;
  }

  .version-badge {
    display: none;
  }

  .controls-section {
    gap: 0.5rem;
    flex: 1;
    justify-content: flex-end;
  }

  .group-selector {
    min-width: 120px;
    max-width: 140px;
  }

  .select-trigger {
    height: 36px;
    font-size: 0.8125rem;
    padding: 0 0.625rem;
  }

  .refresh-button {
    height: 36px;
    padding: 0 0.75rem;
    gap: 0.375rem;
  }

  .refresh-text {
    display: none;
  }
}

@media (max-width: 430px) {
  .app-header-container {
    padding: 0 0.75rem;
  }

  .group-selector {
    min-width: 100px;
    max-width: 120px;
  }

  .refresh-button {
    padding: 0 0.625rem;
  }
}

/* Animation for spinner */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
