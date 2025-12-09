<script setup lang="ts">
import { TabsContent } from 'radix-vue'
import { cn } from '@/lib/utils'

interface Props {
  value: string
}

const props = defineProps<Props>()
</script>

<template>
  <TabsContent
    :value="value"
    :class="cn(
      'mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2',
      'data-[state=active]:animate-fade-in'
    )"
  >
    <slot />
  </TabsContent>
</template>
