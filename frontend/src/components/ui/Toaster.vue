<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import Toast from './Toast.vue'
import { TransitionGroup } from 'vue'

const { toasts, dismiss } = useToast()
</script>

<template>
  <div class="fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
    <TransitionGroup
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <Toast
        v-for="toast in toasts"
        :key="toast.id"
        :variant="toast.variant"
        :title="toast.title"
        :description="toast.description"
        :on-close="() => dismiss(toast.id)"
      />
    </TransitionGroup>
  </div>
</template>
