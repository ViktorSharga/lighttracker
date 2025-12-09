<script setup lang="ts">
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const glassCardVariants = cva(
  'rounded-2xl border backdrop-blur-md transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'border-white/10 bg-bg-elevated/30 shadow-glass',
        highlight: 'border-accent-blue/30 bg-bg-elevated/40 shadow-glass-lg',
        strong: 'border-white/20 bg-bg-elevated/60 shadow-glass-lg',
      },
      glow: {
        true: 'shadow-[0_0_20px_rgba(91,141,239,0.3)]',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      glow: false,
    },
  }
)

interface Props {
  variant?: 'default' | 'highlight' | 'strong'
  glow?: boolean
  hover?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  glow: false,
  hover: false,
})

const classes = computed(() =>
  cn(
    glassCardVariants({ variant: props.variant, glow: props.glow }),
    props.hover && 'hover:-translate-y-1 hover:shadow-glass-lg'
  )
)
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
