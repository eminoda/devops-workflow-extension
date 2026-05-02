<template>
  <div class="space-y-4">
    <div v-if="!history.length" class="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p class="text-sm text-muted-foreground">暂无运行记录</p>
      <Button type="button" size="sm" @click="goJobs">前往 Jobs 管理</Button>
    </div>

    <div v-else class="space-y-2">
      <Card v-for="h in history" :key="h.id" class="border-border/80">
        <CardContent class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ h.jobName || 'Job' }}</span>
              <span v-if="h.buildNumber" class="text-xs text-muted-foreground">#{{ h.buildNumber }}</span>
              <Badge v-if="isRunningRow(h)" variant="secondary">执行中</Badge>
              <Badge v-else-if="h.result" :variant="badgeVariant(h.result)">{{ h.result }}</Badge>
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ formatTime(h.startTime) }}
              <template v-if="h.endTime"> – {{ formatTime(h.endTime) }} </template>
            </div>
            <div v-if="h.error" class="mt-1 break-all text-xs text-destructive">{{ h.error }}</div>
          </div>
          <div v-if="h.buildUrl" class="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" type="button" @click="openUrl(h.buildUrl!)">构建</Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card v-if="pipelineUiBusy || pipelineUiLog">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">本次日志</CardTitle>
      </CardHeader>
      <CardContent>
        <pre
          class="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 font-mono text-xs"
        >{{ pipelineUiLog || (pipelineUiBusy ? '…' : '') }}</pre>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { loadHistory } from '@/lib/storage'
import type { BuildResult, RunRecord } from '@/types'
import { pipelineUiBusy, pipelineUiLog } from '@/ui/composables/pipelineUiState'
import { openUrlInNewTab } from '@/ui/composables/runPipeline'

const router = useRouter()

const history = ref<RunRecord[]>([])

function goJobs() {
  void router.push('/jobs')
}

onMounted(async () => {
  await loadHist()
})

watch(pipelineUiBusy, async (busy, wasBusy) => {
  if (wasBusy === true && busy === false) await loadHist()
})

async function loadHist() {
  history.value = await loadHistory()
}

/** 仅当本地记录尚未写入结束时间且尚无 Jenkins 结果时视为执行中（避免 endTime 丢失但 result 已存在时误显示「执行中」） */
function isRunningRow(h: RunRecord) {
  return h.endTime == null && h.result == null
}

function formatTime(t: number) {
  return new Date(t).toLocaleString()
}

function badgeVariant(r: BuildResult): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (r === 'SUCCESS') return 'outline'
  if (r === 'UNSTABLE') return 'secondary'
  return 'destructive'
}

function openUrl(u: string) {
  openUrlInNewTab(u)
}
</script>
