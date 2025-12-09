<script setup lang="ts">
import { SelectPortal, SelectContent, SelectViewport } from 'radix-vue'
import { cn } from '@/lib/utils'

interface Props {
  position?: 'item-aligned' | 'popper'
  sideOffset?: number
}

const props = withDefaults(defineProps<Props>(), {
  position: 'popper',
  sideOffset: 4,
})
</script>

<template>
  <SelectPortal>
    <SelectContent
      :class="cn(
        'relative z-[9999] min-w-[8rem] overflow-hidden rounded-lg border border-white/10 bg-bg-elevated/95 backdrop-blur-md shadow-glass-lg',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2'
      )"
      :position="position"
      :side-offset="sideOffset"
    >
      <SelectViewport
        :class="cn(
          'p-1',
          position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )"
      >
        <slot />
      </SelectViewport>
    </SelectContent>
  </SelectPortal>
</template>
