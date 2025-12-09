<script setup lang="ts">
import { cn } from '@/lib/utils'
</script>

<template>
  <div
    :class="cn(
      'animate-pulse rounded-lg bg-bg-elevated/50',
      $attrs.class as string
    )"
  />
</template>
