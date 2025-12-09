<script setup lang="ts">
import { SelectTrigger, SelectValue, SelectIcon } from 'radix-vue'
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props {
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})
</script>

<template>
  <SelectTrigger
    :class="cn(
      'flex h-10 w-full items-center justify-between rounded-lg border border-white/10 bg-bg-secondary/50 px-3 py-2 text-sm text-white shadow-neumorphic-inset',
      'focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-bg-primary',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[placeholder]:text-gray-400',
      'transition-all duration-200'
    )"
    :disabled="disabled"
  >
    <SelectValue :placeholder="placeholder" />
    <SelectIcon as-child>
      <ChevronDown class="h-4 w-4 opacity-50" />
    </SelectIcon>
  </SelectTrigger>
</template>
