<script setup lang="ts">
import { SelectRoot } from 'radix-vue'

// Use v-model directly with SelectRoot - it handles its own state
defineProps<{
  modelValue?: string
  defaultValue?: string
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    :default-value="defaultValue"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <slot />
  </SelectRoot>
</template>
