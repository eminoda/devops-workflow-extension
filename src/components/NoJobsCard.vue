<template>
  <Card class="border-0 shadow-none">
    <CardContent class="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <p class="text-sm text-muted-foreground">当前没有 Jobs</p>
      <Button type="button" size="sm" @click="$emit('add')">
        <Plus class="h-4 w-4" />
        添加
      </Button>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

defineEmits<{ add: [] }>()
</script>
