<script setup lang="ts">
import { cn } from '@/lib/utils'
</script>

<template>
  <th
    :class="cn(
      'h-12 px-4 text-left align-middle font-medium text-gray-400',
      '[&:has([role=checkbox])]:pr-0'
    )"
  >
    <slot />
  </th>
</template>
