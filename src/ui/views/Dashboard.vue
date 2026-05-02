<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-2">
      <Card v-if="pipelineUiBusy || pipelineUiLog">
        <CardHeader class="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle class="text-sm">本次日志</CardTitle>
          <Button
            v-if="pipelineUiBusy && pipelineUiActiveBuildUrl"
            variant="destructive"
            size="icon"
            type="button"
            title="终止当前构建"
            :disabled="stopBusy"
            @click="stopActiveBuild"
          >
            <Square class="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <pre
            class="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 font-mono text-xs"
          >{{ pipelineUiLog || (pipelineUiBusy ? '…' : '') }}</pre>
        </CardContent>
      </Card>

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
            <div v-if="h.buildUrl" class="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="icon" type="button" title="打开构建页" @click="openUrl(h.buildUrl!)">
                <ExternalLink class="h-4 w-4" />
              </Button>
              <Button
                v-if="isRunningRow(h)"
                variant="destructive"
                size="icon"
                type="button"
                title="终止构建"
                :disabled="stopBusy"
                @click="stopHistoryBuild(h)"
              >
                <Square class="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <div
      v-if="history.length"
      class="shrink-0 border-t border-border bg-background pt-2 pb-1"
    >
      <Button
        class="block w-full"
        variant="outline"
        type="button"
        :disabled="clearHistBusy"
        @click="onClearHistory"
      >
        清空历史记录
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ExternalLink, Square } from 'lucide-vue-next'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { stopJenkinsBuild } from '@/lib/jenkins'
import { clearRunHistory, loadHistory, loadSettings, reconcileStaleRunRecords } from '@/lib/storage'
import type { BuildResult, RunRecord } from '@/types'
import { pipelineUiActiveBuildUrl, pipelineUiBusy, pipelineUiLog } from '@/ui/composables/pipelineUiState'
import { openUrlInNewTab } from '@/ui/composables/runPipeline'
import { toast } from '@/ui/toast'

const route = useRoute()
const router = useRouter()

const history = ref<RunRecord[]>([])
const stopBusy = ref(false)
const clearHistBusy = ref(false)

/** 仅当本地尚未落地结束态时视为执行中；reconcileStaleRunRecords 会向 Jenkins 查询并补全已结束记录 */
function isRunningRow(h: RunRecord) {
  if (h.endTime != null) return false
  const r = h.result
  if (r == null) return true
  if (typeof r === 'string' && !r.trim()) return true
  return false
}

/** 在运行监控页且存在「执行中」时，定时向 Jenkins 拉取构建状态并 reconcile */
const needsJenkinsPoll = computed(() => {
  const p = route.path
  if (p !== '/' && p !== '') return false
  if (pipelineUiBusy.value) return true
  return history.value.some((h) => isRunningRow(h) && !!(h.buildUrl ?? '').trim())
})

let jenkinsPollTimer: ReturnType<typeof setInterval> | null = null

watch(
  needsJenkinsPoll,
  (need) => {
    if (jenkinsPollTimer) {
      clearInterval(jenkinsPollTimer)
      jenkinsPollTimer = null
    }
    if (!need) return
    jenkinsPollTimer = setInterval(() => void loadHist(), 4000)
    void loadHist()
  },
  { immediate: true },
)

onUnmounted(() => {
  if (jenkinsPollTimer) {
    clearInterval(jenkinsPollTimer)
    jenkinsPollTimer = null
  }
})

function goJobs() {
  void router.push('/jobs')
}

/** 每次进入运行监控路由（/）时默认拉取历史并对 Jenkins 做一次 reconcile */
watch(
  () => route.path,
  (p) => {
    if (p === '/' || p === '') void loadHist()
  },
  { immediate: true },
)

watch(pipelineUiBusy, async (busy, wasBusy) => {
  await nextTick()
  if (busy) await loadHist()
  if (wasBusy === true && busy === false) await loadHist()
})

async function loadHist() {
  const s = await loadSettings()
  await reconcileStaleRunRecords(s)
  history.value = await loadHistory()
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

async function stopBuildByUrl(buildUrl: string) {
  const s = await loadSettings()
  if (!s.jenkinsUrl?.trim() || !s.jenkinsUser || !s.jenkinsToken) {
    toast({ title: '请先在「基础配置」中填写 Jenkins 地址、用户与 API Token', variant: 'error' })
    return
  }
  stopBusy.value = true
  try {
    await stopJenkinsBuild(s.jenkinsUrl, s.jenkinsUser, s.jenkinsToken, buildUrl)
    toast({ title: '已请求停止构建', variant: 'success' })
    await loadHist()
  } catch (e) {
    toast({ title: '停止失败', description: (e as Error).message, variant: 'error', timeoutMs: 4000 })
  } finally {
    stopBusy.value = false
  }
}

async function stopActiveBuild() {
  const u = pipelineUiActiveBuildUrl.value
  if (!u) return
  await stopBuildByUrl(u)
}

async function stopHistoryBuild(h: RunRecord) {
  if (!h.buildUrl) return
  await stopBuildByUrl(h.buildUrl)
}

async function onClearHistory() {
  if (!confirm('确定清空全部运行监控历史记录？此操作不可恢复。')) return
  clearHistBusy.value = true
  try {
    await clearRunHistory()
    history.value = []
    toast({ title: '已清空历史记录', variant: 'success' })
  } catch (e) {
    toast({ title: '清空失败', description: (e as Error).message, variant: 'error' })
  } finally {
    clearHistBusy.value = false
  }
}
</script>
