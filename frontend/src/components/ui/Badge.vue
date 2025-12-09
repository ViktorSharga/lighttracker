<script setup lang="ts">
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-bg-elevated border border-white/20 text-white',
        success: 'bg-accent-green/20 border border-accent-green/30 text-accent-green',
        warning: 'bg-accent-yellow/20 border border-accent-yellow/30 text-accent-yellow',
        destructive: 'bg-accent-red/20 border border-accent-red/30 text-accent-red',
        info: 'bg-accent-blue/20 border border-accent-blue/30 text-accent-blue',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface Props {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})

const classes = computed(() => cn(badgeVariants({ variant: props.variant })))
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
