<script setup lang="ts">
import { cn } from '@/lib/utils'
</script>

<template>
  <tbody :class="cn('[&_tr:last-child]:border-0')">
    <slot />
  </tbody>
</template>
