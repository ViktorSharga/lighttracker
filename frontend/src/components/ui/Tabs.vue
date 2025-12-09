<script setup lang="ts">
import { TabsRoot } from 'radix-vue'

interface Props {
  defaultValue?: string
  modelValue?: string
  orientation?: 'horizontal' | 'vertical'
  dir?: 'ltr' | 'rtl'
  activationMode?: 'automatic' | 'manual'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const handleValueChange = (value: string) => {
  emit('update:modelValue', value)
}
</script>

<template>
  <TabsRoot v-bind="props" @update:model-value="handleValueChange">
    <slot />
  </TabsRoot>
</template>
