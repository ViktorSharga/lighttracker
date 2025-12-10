<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: string | number
  type?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [event: Event]
}>()

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  // Also emit modelValue on change for date inputs (some browsers only fire change, not input)
  emit('update:modelValue', target.value)
  emit('change', event)
}
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :class="cn(
      'flex h-10 w-full rounded-lg border border-white/10 bg-bg-secondary/50 px-3 py-2 text-sm text-white',
      'shadow-neumorphic-inset placeholder:text-gray-400',
      'focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-bg-primary',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'transition-all duration-200'
    )"
    @input="handleInput"
    @change="handleChange"
  />
</template>
