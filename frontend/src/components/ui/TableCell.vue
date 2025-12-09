<script setup lang="ts">
import { cn } from '@/lib/utils'
</script>

<template>
  <td
    :class="cn(
      'p-4 align-middle text-white',
      '[&:has([role=checkbox])]:pr-0'
    )"
  >
    <slot />
  </td>
</template>
