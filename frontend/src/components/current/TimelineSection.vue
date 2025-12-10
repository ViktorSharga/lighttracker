<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui'
import TimelineOverview from './TimelineOverview.vue'
import Timeline24Hour from './Timeline24Hour.vue'
import type { GroupId, Schedule } from '@/services/types'

interface Props {
  schedule: Schedule
}

const props = defineProps<Props>()

// View state
type ViewMode = 'overview' | 'detail'
const viewMode = ref<ViewMode>('overview')
const selectedGroup = ref<GroupId | null>(null)

// Navigate to detail view
const showDetail = (groupId: GroupId) => {
  selectedGroup.value = groupId
  viewMode.value = 'detail'
}

// Navigate back to overview
const backToOverview = () => {
  viewMode.value = 'overview'
  selectedGroup.value = null
}

// Get group data for selected group
const getSelectedGroupData = () => {
  if (!selectedGroup.value) return null
  return props.schedule.groups[selectedGroup.value]
}
</script>

<template>
  <div class="relative">
    <!-- Back button (detail view only) -->
    <Transition name="fade">
      <div v-if="viewMode === 'detail'" class="mb-4">
        <Button
          variant="ghost"
          size="sm"
          class="text-text-secondary hover:text-text-primary"
          @click="backToOverview"
        >
          <ArrowLeft :size="16" class="mr-2" />
          Назад до огляду
        </Button>
      </div>
    </Transition>

    <!-- View container with transitions -->
    <Transition name="timeline-switch" mode="out-in">
      <!-- Overview mode: show all groups -->
      <TimelineOverview
        v-if="viewMode === 'overview'"
        key="overview"
        :schedule="schedule"
        @select-group="showDetail"
      />

      <!-- Detail mode: show single group detailed view -->
      <div v-else key="detail">
        <div class="mb-4">
          <h2 class="text-xl font-semibold text-text-primary">
            Група {{ selectedGroup }}
          </h2>
        </div>
        <Timeline24Hour
          :group-data="getSelectedGroupData()"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Fade transition for back button */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Timeline switch transition */
.timeline-switch-enter-active {
  transition: all 0.3s ease-out;
}

.timeline-switch-leave-active {
  transition: all 0.2s ease-in;
}

.timeline-switch-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.timeline-switch-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
