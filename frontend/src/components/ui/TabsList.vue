<script setup lang="ts">
import { TabsList } from 'radix-vue'
import { cn } from '@/lib/utils'
</script>

<template>
  <TabsList
    :class="cn(
      'inline-flex h-10 items-center justify-center rounded-lg bg-bg-elevated/50 backdrop-blur-md border border-white/10 p-1 text-gray-400',
      'shadow-glass'
    )"
  >
    <slot />
  </TabsList>
</template>
