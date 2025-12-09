<script setup lang="ts">
import { SelectItem, SelectItemText, SelectItemIndicator } from 'radix-vue'
import { Check } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})
</script>

<template>
  <SelectItem
    :value="value"
    :disabled="disabled"
    :class="cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm text-white outline-none',
      'focus:bg-white/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      'transition-colors duration-150'
    )"
  >
    <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectItemIndicator>
        <Check class="h-4 w-4 text-accent-blue" />
      </SelectItemIndicator>
    </span>
    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
