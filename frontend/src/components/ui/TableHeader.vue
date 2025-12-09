<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  sticky?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  sticky: false,
})
</script>

<template>
  <thead
    :class="cn(
      '[&_tr]:border-b border-white/10',
      sticky && 'sticky top-0 z-10 bg-bg-primary/95 backdrop-blur-sm'
    )"
  >
    <slot />
  </thead>
</template>
