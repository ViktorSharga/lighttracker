<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import GlassCard from '@/components/ui/GlassCard.vue'
import ChangeBadge from '@/components/ui/ChangeBadge.vue'
import { useMyGroup } from '@/composables/useMyGroup'
import type { GroupId, GroupData, GroupChange } from '@/services/types'

interface Props {
  groupId: GroupId
  groupData: GroupData
  previousData: GroupData | null
  changeData: GroupChange | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: []
}>()

const { isMyGroup } = useMyGroup()

const isMyGroupCard = computed(() => isMyGroup(props.groupId))

const groupName = computed(() => `Група ${props.groupId}`)

const totalHoursOff = computed(() => {
  const totalMinutes = props.groupData.totalMinutesOff
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  let result = ''
  if (hours > 0) {
    result += `${hours} год`
  }
  if (minutes > 0) {
    if (hours > 0) result += ' '
    result += `${minutes} хв`
  }
  if (hours === 0 && minutes === 0) {
    result = '0 хв'
  }
  result += ' без світла'

  return result
})

const intervalsText = computed(() => props.groupData.intervalsText)

const hasChange = computed(() => props.changeData !== null && props.changeData.differenceMinutes !== 0)

const variant = computed(() => (isMyGroupCard.value ? 'highlight' : 'default'))
const glow = computed(() => isMyGroupCard.value)
</script>

<template>
  <GlassCard
    :variant="variant"
    :glow="glow"
    hover
    :class="cn(
      'group-card relative cursor-pointer p-5 transition-all duration-300',
      isMyGroupCard && 'ring-1 ring-accent-blue/30'
    )"
    @click="emit('click')"
  >
    <!-- My Group Star Icon -->
    <div v-if="isMyGroupCard" class="absolute top-3 right-3">
      <Star class="h-5 w-5 fill-accent-blue text-accent-blue" />
    </div>

    <!-- Content -->
    <div :class="cn('space-y-3', isMyGroupCard && 'mt-4')">
      <!-- Group Name Header with Change Badge -->
      <div class="flex items-center gap-3">
        <h3 class="text-xl font-semibold text-text-primary">
          {{ groupName }}
        </h3>
        <ChangeBadge v-if="hasChange && changeData" :change="changeData.differenceMinutes" />
      </div>

      <!-- Total Hours Off -->
      <p class="text-base text-text-secondary">
        {{ totalHoursOff }}
      </p>

      <!-- Intervals Text -->
      <p class="text-sm text-text-tertiary font-mono leading-relaxed">
        {{ intervalsText }}
      </p>
    </div>
  </GlassCard>
</template>
