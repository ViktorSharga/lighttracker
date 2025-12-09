<script setup lang="ts">
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-bg-primary disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-bg-elevated text-white shadow-neumorphic hover:shadow-neumorphic-inset hover:scale-[0.98] active:scale-95',
        secondary: 'bg-bg-secondary text-white border border-white/10 hover:bg-bg-elevated hover:scale-[1.02]',
        destructive: 'bg-accent-red text-white hover:bg-accent-red/90 hover:scale-[1.02]',
        outline: 'border border-white/20 bg-transparent hover:bg-white/5 hover:border-white/30',
        ghost: 'hover:bg-white/5 hover:text-white',
        link: 'text-accent-blue underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

interface Props {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  disabled: false,
  type: 'button',
})

const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size })))
</script>

<template>
  <button
    :class="classes"
    :disabled="disabled"
    :type="type"
  >
    <slot />
  </button>
</template>
