<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  hover?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  hover: false,
})
</script>

<template>
  <div
    :class="cn(
      'rounded-xl border border-white/10 bg-bg-elevated/50 backdrop-blur-md shadow-glass transition-all duration-300',
      hover && 'hover:-translate-y-1 hover:shadow-glass-lg',
    )"
  >
    <slot />
  </div>
</template>
