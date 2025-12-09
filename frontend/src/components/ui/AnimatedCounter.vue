<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { gsap } from 'gsap'

interface Props {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
}

const props = withDefaults(defineProps<Props>(), {
  duration: 1,
  prefix: '',
  suffix: '',
})

const displayValue = ref(0)
const counterRef = ref<HTMLSpanElement | null>(null)

const animateToValue = (newValue: number) => {
  gsap.to(displayValue, {
    value: newValue,
    duration: props.duration,
    ease: 'power2.out',
    snap: { value: 1 }, // Snap to integers
  })
}

watch(
  () => props.value,
  (newValue) => {
    animateToValue(newValue)
  }
)

onMounted(() => {
  animateToValue(props.value)
})
</script>

<template>
  <span ref="counterRef">
    {{ prefix }}{{ Math.round(displayValue) }}{{ suffix }}
  </span>
</template>
