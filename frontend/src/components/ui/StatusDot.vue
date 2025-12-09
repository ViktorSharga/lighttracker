<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

type Status = 'online' | 'offline' | 'fetching'

interface Props {
  status: Status
}

const props = defineProps<Props>()

const statusClasses = computed(() => {
  switch (props.status) {
    case 'online':
      return 'bg-accent-green'
    case 'offline':
      return 'bg-accent-red'
    case 'fetching':
      return 'bg-accent-yellow animate-pulse'
    default:
      return 'bg-gray-400'
  }
})
</script>

<template>
  <span
    :class="cn(
      'inline-block h-2 w-2 rounded-full',
      statusClasses
    )"
    :aria-label="`Status: ${status}`"
  />
</template>
