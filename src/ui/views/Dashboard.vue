<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-2">
      <div v-if="!history.length" class="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <p class="text-sm text-muted-foreground">暂无运行记录</p>
        <Button type="button" size="sm" @click="goJobs">前往 Jobs 管理</Button>
      </div>

      <div v-else class="space-y-2">
        <Card v-for="h in history" :key="h.id" class="border-border/80">
          <CardContent class="flex flex-col gap-3 py-3">
            <div class="flex flex-row items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ h.jobName || 'Job' }}</span>
                <button
                  v-if="h.buildNumber && h.buildUrl"
                  type="button"
                  class="inline-flex items-center gap-0.5 rounded-sm text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  :title="`在 Jenkins 中打开构建 #${h.buildNumber}`"
                  @click="openUrl(h.buildUrl!)"
                >
                  <span>#{{ h.buildNumber }}</span>
                  <Link class="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                </button>
                <span v-else-if="h.buildNumber" class="text-xs text-muted-foreground">#{{ h.buildNumber }}</span>
                <span
                  v-if="isRunningRow(h)"
                  class="inline-flex shrink-0 items-center gap-1"
                  title="执行中"
                >
                  <button
                    v-if="jenkinsExtraLinkWhileRunning(h)"
                    type="button"
                    class="inline-flex rounded-sm text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    title="在 Jenkins 中打开"
                    aria-label="在 Jenkins 中打开"
                    @click="openUrl(jenkinsMonitorLink(h)!)"
                  >
                    <Link class="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <Loader2
                    class="h-4 w-4 animate-spin text-primary"
                    aria-label="执行中"
                  />
                </span>
                <CheckCircle2
                  v-else-if="h.result === 'SUCCESS'"
                  class="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
                  title="成功"
                  aria-label="成功"
                />
                <XCircle
                  v-else-if="h.result === 'FAILURE'"
                  class="h-4 w-4 shrink-0 text-destructive"
                  title="失败"
                  aria-label="失败"
                />
                <AlertTriangle
                  v-else-if="h.result === 'UNSTABLE'"
                  class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  title="不稳定"
                  aria-label="不稳定"
                />
                <Ban
                  v-else-if="h.result === 'ABORTED'"
                  class="h-4 w-4 shrink-0 text-muted-foreground"
                  title="已中止"
                  aria-label="已中止"
                />
                <CircleDot
                  v-else-if="h.result"
                  class="h-4 w-4 shrink-0 text-muted-foreground"
                  :title="String(h.result)"
                  :aria-label="String(h.result)"
                />
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ formatTime(h.startTime) }}
                <template v-if="h.endTime"> – {{ formatTime(h.endTime) }} </template>
              </div>
              <div v-if="h.error" class="mt-1 break-all text-xs text-destructive">{{ h.error }}</div>
              <div v-if="lastSuccessParamsSnapshot(h.jobId)" class="mt-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  :aria-expanded="lastSuccessExpandedRunId === h.id"
                  :aria-controls="'last-success-' + h.id"
                  @click="toggleLastSuccessPanel(h.id)"
                >
                  <ChevronRight
                    class="h-3.5 w-3.5 shrink-0 transition-transform"
                    :class="{ 'rotate-90': lastSuccessExpandedRunId === h.id }"
                    aria-hidden="true"
                  />
                  上次成功参数（Job 维度）
                </button>
                <div
                  v-show="lastSuccessExpandedRunId === h.id"
                  :id="`last-success-${h.id}`"
                  class="mt-1.5 max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground"
                >
                  <pre class="whitespace-pre-wrap break-all">{{ formatLastSuccessJson(lastSuccessParamsSnapshot(h.jobId)) }}</pre>
                </div>
              </div>
            </div>
            <div
              v-if="showStopInMainRow(h)"
              class="ml-auto flex shrink-0 items-center gap-1 self-center"
            >
              <Button
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
            </div>

            <div
              v-if="pipelineLogForRow(h)"
              class="space-y-1.5 border-t border-border/60 pt-3"
            >
              <div class="flex flex-row items-center justify-between gap-2">
                <span class="text-xs font-medium text-muted-foreground">本次日志</span>
                <Button
                  v-if="showStopInLogHeader(h)"
                  variant="destructive"
                  size="icon"
                  type="button"
                  title="终止当前构建"
                  :disabled="stopBusy"
                  @click="stopActiveBuild"
                >
                  <Square class="h-4 w-4" />
                </Button>
              </div>
              <pre
                class="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 font-mono text-xs"
              >{{ pipelineUiLog || (pipelineUiBusy ? '…' : '') }}</pre>
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
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Link,
  Loader2,
  Square,
  XCircle,
} from 'lucide-vue-next'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildJobPageUrl, stopJenkinsBuild } from '@/lib/jenkins'
import {
  clearRunHistory,
  loadHistory,
  loadJobs,
  loadSettings,
  reconcileStaleRunRecords,
  subscribeRunHistoryLocalChanges,
} from '@/lib/storage'
import type { JobConfig, RunRecord } from '@/types'
import {
  pipelineUiActiveBuildUrl,
  pipelineUiActiveRunId,
  pipelineUiBusy,
  pipelineUiLog,
  requestStopActivePipelineBuild,
} from '@/ui/composables/pipelineUiState'
import { openUrlInNewTab } from '@/ui/composables/runPipeline'
import { toast } from '@/ui/toast'

const route = useRoute()
const router = useRouter()

const history = ref<RunRecord[]>([])
const stopBusy = ref(false)
const clearHistBusy = ref(false)
const jenkinsBase = ref('')
const jobsById = ref(new Map<string, JobConfig>())
/** 运行监控卡片：展开「上次成功参数」的记录 id（与 Job 中保存的快照对应） */
const lastSuccessExpandedRunId = ref<string | null>(null)

/** 仅当本地尚未落地结束态时视为执行中；reconcileStaleRunRecords 会向 Jenkins 查询并补全已结束记录 */
function isRunningRow(h: RunRecord) {
  if (h.endTime != null) return false
  const r = h.result
  if (r == null) return true
  if (typeof r === 'string' && !r.trim()) return true
  return false
}

function pipelineLogForRow(h: RunRecord): boolean {
  return pipelineUiActiveRunId.value === h.id && (!!pipelineUiLog.value || pipelineUiBusy.value)
}

/** 本会话正在跑的构建：终止按钮放在「本次日志」标题旁 */
function showStopInLogHeader(h: RunRecord): boolean {
  return (
    pipelineUiActiveRunId.value === h.id &&
    pipelineUiBusy.value &&
    !!pipelineUiActiveBuildUrl.value
  )
}

/** 非本会话触发的执行中记录（如仅 reconcile）：终止仍在卡片主行右侧 */
function showStopInMainRow(h: RunRecord): boolean {
  if (!(h.buildUrl && isRunningRow(h))) return false
  if (showStopInLogHeader(h)) return false
  return true
}

/**
 * 执行中且尚无「#构建号 + buildUrl」主链接时，在 loading 旁显示额外 Jenkins 图标（队列入队中等）。
 */
function jenkinsExtraLinkWhileRunning(h: RunRecord): boolean {
  if (h.buildNumber != null && !!(h.buildUrl ?? '').trim()) return false
  return !!jenkinsMonitorLink(h)
}

/** 执行中记录：构建页 > 队列页（由 api/json 推导）> 任务主页 */
function jenkinsMonitorLink(h: RunRecord): string | null {
  const bu = (h.buildUrl ?? '').trim()
  if (bu) return bu

  const qu = (h.queueItemApiUrl ?? '').trim()
  if (qu) {
    const stripped = qu.replace(/\/api\/json\/?$/i, '')
    if (stripped) return stripped.endsWith('/') ? stripped : `${stripped}/`
  }

  const base = jenkinsBase.value.trim()
  if (!base) return null
  const job = jobsById.value.get(h.jobId)
  const path = job?.jobPath?.trim()
  if (!path) return null
  return buildJobPageUrl(base, path)
}

/** background 每 4s reconcile；本地订阅历史存储变化以刷新列表 */
let unsubRunHistory: (() => void) | null = null

onMounted(() => {
  unsubRunHistory = subscribeRunHistoryLocalChanges(() => {
    if (route.name === 'dashboard') void loadHist()
  })
})

onUnmounted(() => {
  unsubRunHistory?.()
  unsubRunHistory = null
})

function goJobs() {
  void router.push('/jobs')
}

/** 每次进入运行监控路由时拉取历史并向 Jenkins reconcile */
watch(
  () => route.name,
  (name) => {
    if (name === 'dashboard') {
      console.log('[JenkinsRunner] 进入运行监控路由，触发 loadHist')
      void loadHist()
    }
  },
  { immediate: true },
)

watch(pipelineUiBusy, async (busy, wasBusy) => {
  await nextTick()
  if (busy) await loadHist()
  if (wasBusy === true && busy === false) await loadHist()
})

async function loadHist() {
  console.log('[JenkinsRunner] loadHist 开始')
  const s = await loadSettings()
  jenkinsBase.value = (s.jenkinsUrl ?? '').trim()
  const jobs = await loadJobs()
  jobsById.value = new Map(jobs.map((j) => [j.id, j]))
  const reconciled = await reconcileStaleRunRecords(s)
  history.value = await loadHistory()
  if (
    lastSuccessExpandedRunId.value &&
    !history.value.some((row) => row.id === lastSuccessExpandedRunId.value)
  ) {
    lastSuccessExpandedRunId.value = null
  }
  console.log('[JenkinsRunner] loadHist 结束', {
    reconcileReturned: reconciled,
    historyLength: history.value.length,
  })
}

function formatTime(t: number) {
  return new Date(t).toLocaleString()
}

function lastSuccessParamsSnapshot(jobId: string): Record<string, string> | null {
  const p = jobsById.value.get(jobId)?.lastSuccessParams
  if (!p || typeof p !== 'object') return null
  return Object.keys(p).length ? p : null
}

function formatLastSuccessJson(p: Record<string, string> | null): string {
  if (!p) return ''
  try {
    return JSON.stringify(p, null, 2)
  } catch {
    return String(p)
  }
}

function toggleLastSuccessPanel(runId: string) {
  lastSuccessExpandedRunId.value = lastSuccessExpandedRunId.value === runId ? null : runId
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
  if (!pipelineUiActiveBuildUrl.value) return
  stopBusy.value = true
  try {
    const r = await requestStopActivePipelineBuild()
    if (!r.ok) {
      toast({ title: '停止失败', description: r.error ?? '未知错误', variant: 'error', timeoutMs: 4000 })
      return
    }
    toast({ title: '已请求停止构建', variant: 'success' })
    await loadHist()
  } finally {
    stopBusy.value = false
  }
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
