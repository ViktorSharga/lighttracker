<script setup lang="ts">
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-vue-next'

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-lg border p-4 pr-8 shadow-glass-lg backdrop-blur-md transition-all',
  {
    variants: {
      variant: {
        default: 'border-white/10 bg-bg-elevated/95 text-white',
        success: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
        error: 'border-accent-red/30 bg-accent-red/10 text-accent-red',
        warning: 'border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow',
        info: 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface Props {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info'
  title?: string
  description?: string
  onClose?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})

const icon = computed(() => {
  switch (props.variant) {
    case 'success':
      return CheckCircle
    case 'error':
      return XCircle
    case 'warning':
      return AlertCircle
    case 'info':
      return Info
    default:
      return null
  }
})

const classes = computed(() => cn(toastVariants({ variant: props.variant })))
</script>

<template>
  <div :class="classes">
    <div class="flex items-start gap-3">
      <component :is="icon" v-if="icon" class="h-5 w-5 mt-0.5 flex-shrink-0" />
      <div class="grid gap-1">
        <div v-if="title" class="text-sm font-semibold">{{ title }}</div>
        <div v-if="description" class="text-sm opacity-90">{{ description }}</div>
        <slot />
      </div>
    </div>
    <button
      v-if="onClose"
      class="absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent-blue"
      @click="onClose"
    >
      <X class="h-4 w-4" />
      <span class="sr-only">Close</span>
    </button>
  </div>
</template>
