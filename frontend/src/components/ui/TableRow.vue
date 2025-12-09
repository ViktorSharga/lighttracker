<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  hover?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  hover: true,
})
</script>

<template>
  <tr
    :class="cn(
      'border-b border-white/10 transition-colors',
      hover && 'hover:bg-white/5 data-[state=selected]:bg-white/10'
    )"
  >
    <slot />
  </tr>
</template>
