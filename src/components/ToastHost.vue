<template>
  <div class="pointer-events-none fixed bottom-3 left-1/2 z-50 w-[calc(100%-1.25rem)] max-w-sm -translate-x-1/2 space-y-2">
    <div
      v-for="t in toastStore.items"
      :key="t.id"
      class="pointer-events-auto rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="truncate text-sm font-medium" :class="titleClass(t.variant)">{{ t.title || '提示' }}</div>
          <div v-if="t.description" class="mt-1 text-xs text-muted-foreground break-words">{{ t.description }}</div>
        </div>
        <Button variant="ghost" size="icon" class="h-7 w-7" type="button" @click="dismiss(t.id)">
          <X class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { toastStore } from '@/ui/toast'

function dismiss(id: string) {
  toastStore.items = toastStore.items.filter((t) => t.id !== id)
}

function titleClass(variant: string) {
  if (variant === 'success') return 'text-emerald-700'
  if (variant === 'error') return 'text-destructive'
  return ''
}
</script>

