<template>
  <div class="space-y-4">
    <!-- 列表页 -->
    <template v-if="mode === 'list'">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-sm font-semibold">Jobs 管理</h1>
        <Button v-if="jobs.length" type="button" size="icon" title="新建 Job" @click="addJobAndOpen">
          <Plus class="h-4 w-4" />
        </Button>
      </div>

      <NoJobsCard v-if="!jobs.length" @add="addJobAndOpen" />

      <div v-else class="flex flex-col">
        <template v-for="(item, index) in jobsListDisplay" :key="item.job.id">
          <Separator v-if="showJobListDivider(index)" class="my-2 shrink-0" />
          <Card
            class="border-0 shadow-none"
            :style="item.depth > 0 ? { marginLeft: `${12 + (item.depth - 1) * 16}px` } : undefined"
          >
            <CardContent
              class="flex items-center gap-2 pb-4"
              :class="item.depth > 0 ? 'pt-0' : 'pt-4'"
            >
              <div
                class="flex h-9 w-5 shrink-0 items-center justify-center text-muted-foreground"
                :title="item.depth > 0 ? '关联链中的后续 Job' : 'Job 链起点'"
                aria-hidden="true"
              >
                <Folder v-if="item.depth === 0" class="h-4 w-4" />
                <CornerDownRight v-else class="h-4 w-4" />
              </div>
              <div
                class="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                role="button"
                tabindex="0"
                :aria-label="`打开 ${item.job.name || 'Job'} 详情`"
                @click="openDetail(item.job.id)"
                @keydown.enter.prevent="openDetail(item.job.id)"
                @keydown.space.prevent="openDetail(item.job.id)"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <div class="truncate text-sm font-medium">{{ item.job.name || '新 Job' }}</div>
                  <button
                    v-if="item.job.verifyUrl?.trim()"
                    type="button"
                    class="inline-flex shrink-0 rounded-sm text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    title="打开验证地址"
                    aria-label="打开验证地址"
                    @click.stop="openUrlTab(item.job.verifyUrl!.trim())"
                  >
                    <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <Badge v-if="draftMap[item.job.id]" variant="secondary" class="shrink-0">草稿</Badge>
                </div>
                <div class="truncate font-mono text-xs text-muted-foreground">{{ item.job.jobPath || '（未填写）' }}</div>
              </div>
              <div class="flex shrink-0 items-center gap-1" @click.stop>
                <Button type="button" size="icon" variant="outline" title="详情" @click="openDetail(item.job.id)">
                  <SlidersHorizontal class="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" :disabled="pipelineUiBusy" title="运行" @click="runOne(item.job)">
                  <Play class="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </template>
      </div>
    </template>

    <!-- 详情页 -->
    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" type="button" class="px-2" @click="goList">
          <ChevronLeft class="h-4 w-4" />
          返回
        </Button>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <div class="truncate text-sm font-semibold">{{ curJob?.name || '新 Job' }}</div>
            <Badge v-if="curJob && draftMap[curJob.id]" variant="secondary" class="shrink-0">草稿</Badge>
          </div>
          <div class="truncate font-mono text-xs text-muted-foreground">{{ curJob?.jobPath || '' }}</div>
        </div>
      </div>

      <Card v-if="curJob" class="border-0 shadow-none">
        <CardContent class="space-y-4 pb-20 pt-4">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <Label :for="`path-${curJob.id}`">Job 名称</Label>
              <Input
                :id="`path-${curJob.id}`"
                v-model="curJob.jobPath"
                class="font-mono text-xs"
                placeholder="Jenkins Dashboard 中任务的名称"
                @input="onJobPathInput(curJob)"
              />
            </div>
            <div class="space-y-2">
              <Label :for="`name-${curJob.id}`">别名</Label>
              <Input
                :id="`name-${curJob.id}`"
                v-model="curJob.name"
                class="text-xs"
                placeholder="默认 Job 名称"
                @input="onJobNameInput(curJob)"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label>构建参数</Label>
            <p v-if="msg[curJob.id]" class="text-xs text-amber-700">{{ msg[curJob.id] }}</p>

            <div
              v-if="buildParamsLoading[curJob.id]"
              class="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-4 text-sm text-muted-foreground"
            >
              <Loader2 class="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              <span>正在加载 Jenkins 参数页…</span>
            </div>

            <template v-else>
              <div v-for="(row, idx) in rowCache[curJob.id] || []" :key="idx" class="space-y-1.5">
                <div class="flex gap-2">
                  <Input
                    v-model="row.k"
                    class="min-w-0 flex-[3] font-mono text-xs"
                    placeholder="如：branch"
                    @input="onRowChange(curJob)"
                  />

                  <template v-if="row.t !== 'text' && getParamOptions(curJob.id, row.k, row.t).length">
                    <select
                      :class="cn(selectCls, 'min-w-0 flex-[7] text-xs')"
                      :value="row.v"
                      @change="onParamOptionSelected($event, curJob, row)"
                    >
                      <option v-for="opt in getParamOptions(curJob.id, row.k, row.t)" :key="opt" :value="opt">
                        {{ opt }}
                      </option>
                    </select>
                  </template>
                  <template v-else>
                    <Input v-model="row.v" class="min-w-0 flex-[7] text-xs" placeholder="参数值" @input="onRowChange(curJob)" />
                  </template>

                  <button
                    type="button"
                    class="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    :aria-label="`删除参数 ${row.k || idx + 1}`"
                    @click="removeParamRow(curJob, idx)"
                  >
                    <Trash2 class="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <label
                  v-if="row.t !== 'text' && getParamOptions(curJob.id, row.k, row.t).length && (row.t === 'choice' || row.t === 'dynamic')"
                  class="flex cursor-pointer items-center gap-2 ps-0.5 text-xs text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    class="size-3.5 shrink-0 rounded border border-input accent-primary"
                    :checked="row.t === 'dynamic' ? row.dynamicLatest !== false : !!row.choiceLatest"
                    @change="onLatestAtRunCheckbox(curJob, row, $event)"
                  />
                  <span>执行时是否取最新值？</span>
                </label>
              </div>
            </template>

            <Button
              variant="ghost"
              class="w-full justify-center border border-dashed border-border/70 text-muted-foreground hover:text-foreground"
              type="button"
              :disabled="!curJob"
              @click="openParamAddSheet"
            >
              <Plus class="h-4 w-4" />
              添加参数
            </Button>
          </div>

          <template v-if="jobs.length > 1">
            <Separator />

            <div class="space-y-2">
              <Label :for="`next-${curJob.id}`">关联 Job</Label>
              <select
                :id="`next-${curJob.id}`"
                :value="curJob.nextJobId ?? ''"
                :class="selectCls"
                @change="onNextJobChange($event, curJob)"
              >
                <option value="">（不关联）</option>
                <option v-for="o in otherJobs(curJob.id)" :key="o.id" :value="o.id">
                  {{ o.name || o.id }}
                </option>
              </select>
            </div>
          </template>

          <div class="space-y-2">
            <Label :for="`vu-${curJob.id}`">验证地址</Label>
            <Input
              :id="`vu-${curJob.id}`"
              v-model="curJob.verifyUrl"
              type="url"
              placeholder="例如：https://xxx.xxx.com/（可选）"
              @input="markDirty(curJob.id)"
            />
          </div>

          <p v-if="curJob.lastSuccessParams" class="text-xs text-muted-foreground">
            上次成功：
            <code class="rounded bg-muted px-1 py-0.5">{{ JSON.stringify(curJob.lastSuccessParams) }}</code>
          </p>
        </CardContent>
      </Card>
      <!-- 悬浮操作栏（详情页） -->
      <div
        v-if="curJob"
        class="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur"
      >
        <div class="mx-auto flex max-w-3xl gap-2">
          <Button class="flex-1" size="sm" type="button" @click="saveOne(curJob)">
            <Save class="h-4 w-4" />
            保存
          </Button>
          <Button class="flex-1" variant="destructive" size="sm" type="button" @click="remove(curJob.id)">
            <Trash2 class="h-4 w-4" />
            删除
          </Button>
        </div>
      </div>

      <Sheet v-model:open="paramAddSheetOpen">
        <SheetContent side="bottom" class="max-h-[85vh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle>添加参数</SheetTitle>
          </SheetHeader>
          <div v-if="curJob" class="mt-4 space-y-4">
            <div class="space-y-2">
              <Label class="text-xs" :for="`add-pk-${curJob.id}`">参数名称</Label>
              <Input
                :id="`add-pk-${curJob.id}`"
                v-model="manualParam.k"
                class="font-mono text-xs"
                placeholder="如：branch"
              />
            </div>
            <div class="space-y-2">
              <Label class="text-xs" :for="`add-pv-${curJob.id}`">参数值</Label>
              <Input :id="`add-pv-${curJob.id}`" v-model="manualParam.v" class="text-xs" placeholder="文本值" />
            </div>
            <div class="flex gap-2 pt-2">
              <Button class="flex-1" size="sm" type="button" @click="confirmManualParamAdd(curJob)">添加</Button>
              <Button class="flex-1" size="sm" variant="outline" type="button" @click="closeParamAddSheet">取消</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </template>
  </div>
</template>

<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronLeft,
  CornerDownRight,
  ExternalLink,
  Folder,
  Loader2,
  Play,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
} from 'lucide-vue-next'
import NoJobsCard from '@/components/NoJobsCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { defaultParamAutoFillSelectorString } from '@/lib/jenkins-param-autofill-selectors'
import {
  joinCompositeParamValue,
  parseJenkinsBuildParameterFormHtml,
} from '@/lib/jenkins-build-form-parse'
import { fetchBuildWithParamsPageHtml, fetchJenkinsFillUrlOptions } from '@/lib/jenkins'
import { cn } from '@/lib/utils'
import { loadJobs, loadSettings, saveJobs, STORAGE_RELOAD_EVENT } from '@/lib/storage'
import { pipelineUiBusy, runJobFromUi } from '@/ui/composables/pipelineUiState'
import { openUrlInNewTab } from '@/ui/composables/runPipeline'
import { toast } from '@/ui/toast'
import type { JobConfig, JobParamConfig, JobParamInputType } from '@/types'

const router = useRouter()

const selectCls = cn(
  'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
)

function newJob(): JobConfig {
  return {
    id: crypto.randomUUID(),
    name: '',
    jobPath: '',
    displayParams: {},
    nextJobId: null,
    lastSuccessParams: null,
    verifyUrl: '',
  }
}

const jobs = ref<JobConfig[]>([])
/** 列表展示：按 nextJobId 链缩进，子 Job 左侧虚线 + 缩进 */
type JobListRow = { job: JobConfig; depth: number }
const jobsListDisplay = computed<JobListRow[]>(() => {
  const list = jobs.value
  if (!list.length) return []
  const byId = new Map(list.map((j) => [j.id, j]))
  const incoming = new Set(
    list.map((j) => j.nextJobId).filter((id): id is string => typeof id === 'string' && !!id.trim()),
  )
  const indexById = new Map(list.map((j, i) => [j.id, i]))
  const roots = list
    .filter((j) => !incoming.has(j.id))
    .sort((a, b) => (indexById.get(a.id)! - indexById.get(b.id)!))

  const rows: JobListRow[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    let depth = 0
    let cur: JobConfig | undefined = root
    const chainSeen = new Set<string>()
    while (cur && !chainSeen.has(cur.id)) {
      if (seen.has(cur.id)) break
      chainSeen.add(cur.id)
      seen.add(cur.id)
      rows.push({ job: cur, depth })
      depth++
      const nextId = (cur.nextJobId ?? '').trim()
      cur = nextId ? byId.get(nextId) : undefined
    }
  }
  for (const j of list) {
    if (!seen.has(j.id)) {
      seen.add(j.id)
      rows.push({ job: j, depth: 0 })
    }
  }
  return rows
})

/** 相邻两条为父子链（子 depth = 父 depth + 1）时不画分割线 */
function showJobListDivider(index: number): boolean {
  const rows = jobsListDisplay.value
  if (index <= 0) return false
  return rows[index]!.depth !== rows[index - 1]!.depth + 1
}

const mode = ref<'list' | 'detail'>('list')
const selectedJobId = ref<string | null>(null)
const curJob = computed(() => jobs.value.find((j) => j.id === selectedJobId.value) ?? null)
type ParamRow = { k: string; v: string; t: JobParamInputType; dynamicLatest?: boolean; choiceLatest?: boolean }
const rowCache = reactive<Record<string, ParamRow[]>>({})
const msg = reactive<Record<string, string>>({})
const draftMap = reactive<Record<string, boolean>>({})
/** 为 true 时，Job 名称变更会同步写入别名，直至用户手动编辑过别名 */
const aliasAutoSync = reactive<Record<string, boolean>>({})

const paramOptionCache = reactive<Record<string, string[]>>({})
/** 正在请求 …/build?delay=0sec 并解析参数 */
const buildParamsLoading = reactive<Record<string, boolean>>({})
const paramAddSheetOpen = ref(false)
const manualParam = reactive({ k: '', v: '' })

async function bootstrapJobsFromStorage() {
  jobs.value = await loadJobs()
  for (const k of Object.keys(rowCache)) delete rowCache[k]
  for (const k of Object.keys(paramOptionCache)) delete paramOptionCache[k]
  for (const k of Object.keys(buildParamsLoading)) delete buildParamsLoading[k]
  for (const k of Object.keys(msg)) delete msg[k]
  for (const k of Object.keys(draftMap)) delete draftMap[k]
  for (const k of Object.keys(aliasAutoSync)) delete aliasAutoSync[k]
  for (const j of jobs.value) {
    ensureRows(j)
    draftMap[j.id] = false
    aliasAutoSync[j.id] = !j.name.trim() || j.name.trim() === j.jobPath.trim()
  }
  if (selectedJobId.value && !jobs.value.some((j) => j.id === selectedJobId.value)) goList()
}

function onStorageReloadFromImport() {
  void bootstrapJobsFromStorage()
}

onMounted(async () => {
  await bootstrapJobsFromStorage()
  window.addEventListener(STORAGE_RELOAD_EVENT, onStorageReloadFromImport)
})

onUnmounted(() => {
  window.removeEventListener(STORAGE_RELOAD_EVENT, onStorageReloadFromImport)
})

async function runOne(j: JobConfig) {
  void router.push('/')
  try {
    await runJobFromUi(j.id)
  } catch (e) {
    toast({ title: '无法启动', description: (e as Error).message, variant: 'error', timeoutMs: 4000 })
    return
  }
  jobs.value = await loadJobs()
}

function openUrlTab(u: string) {
  openUrlInNewTab(u)
}

function goList() {
  paramAddSheetOpen.value = false
  mode.value = 'list'
  selectedJobId.value = null
}

function openDetail(id: string) {
  paramAddSheetOpen.value = false
  const j = jobs.value.find((x) => x.id === id)
  if (j) {
    ensureRows(j)
    aliasAutoSync[j.id] = !j.name.trim() || j.name.trim() === j.jobPath.trim()
  }
  selectedJobId.value = id
  mode.value = 'detail'
}

function markDirty(id: string) {
  draftMap[id] = true
}

function onJobPathInput(j: JobConfig) {
  markDirty(j.id)
  if (aliasAutoSync[j.id]) j.name = j.jobPath
}

function onJobNameInput(j: JobConfig) {
  aliasAutoSync[j.id] = false
  markDirty(j.id)
}

function openParamAddSheet() {
  manualParam.k = ''
  manualParam.v = ''
  paramAddSheetOpen.value = true
}

function closeParamAddSheet() {
  paramAddSheetOpen.value = false
}

function confirmManualParamAdd(j: JobConfig) {
  const k = manualParam.k.trim()
  if (!k) {
    toast({ title: '请填写参数名称', variant: 'error' })
    return
  }
  ensureRows(j)
  const rows = rowCache[j.id]!
  const idx = rows.findIndex((r) => r.k.trim() === k)
  const next: ParamRow = { k, v: manualParam.v ?? '', t: 'text' }
  if (idx >= 0) rows[idx] = next
  else rows.push(next)
  rowsToParams(j)
  markDirty(j.id)
  closeParamAddSheet()
  msg[j.id] = '已添加参数，请点击「保存」写入本机。'
}

function ensureRows(j: JobConfig) {
  if (!rowCache[j.id]) {
    const d = j.displayParams || {}
    const entries = Object.entries(d)
    rowCache[j.id] = entries.length
      ? entries.map(([k, v]) => {
          const t = (j.paramConfig?.[k]?.type ?? (j.paramAutoFill?.[k] ? 'dynamic' : 'text')) as JobParamInputType
          const dynamicLatest = j.paramConfig?.[k]?.dynamicLatest ?? true
          const choiceLatest = j.paramConfig?.[k]?.choiceLatest === true
          return { k, v: String(v), t, dynamicLatest, choiceLatest }
        })
      : []
  }
}

function rowsToParams(j: JobConfig) {
  const rows = rowCache[j.id] || []
  const p: Record<string, string> = {}
  const cfg: Record<string, JobParamConfig> = {}
  j.paramAutoFill ??= {}
  for (const r of rows) {
    const key = r.k.trim()
    if (!key) continue
    p[key] = r.v
    cfg[key] = {
      type: r.t,
      dynamicLatest: r.t === 'dynamic' ? (r.dynamicLatest ?? true) : undefined,
      choiceLatest: r.t === 'choice' ? !!r.choiceLatest : undefined,
    }

    // 动态 / choice 勾选「执行时取最新」：运行时从参数页抓取该下拉首项覆盖提交值
    if (r.t === 'dynamic') {
      if (cfg[key].dynamicLatest !== false) ensureDynamicAutoRule(j, key)
      else if (j.paramAutoFill[key]) delete j.paramAutoFill[key]
    } else if (r.t === 'choice' && r.choiceLatest) {
      ensureDynamicAutoRule(j, key)
    } else if (j.paramAutoFill[key]) {
      delete j.paramAutoFill[key]
    }
  }
  j.displayParams = p
  j.paramConfig = cfg
}

function onRowChange(j: JobConfig) {
  rowsToParams(j)
  markDirty(j.id)
}

function optionKey(jobId: string, paramKey: string, t: JobParamInputType) {
  return `${jobId}:${t}:${paramKey}`
}

/** 从 Jenkins 参数页（…/job/…/build?delay=0sec）解析并填充构建参数行 */
async function syncBuildParamsFromHtml(j: JobConfig) {
  const settings = await loadSettings()
  if (!settings.jenkinsUrl?.trim() || !settings.jenkinsUser || !settings.jenkinsToken) {
    msg[j.id] = '请先完成 Jenkins 连接配置（地址、用户、Token），才能同步构建参数。'
    return
  }
  if (!j.jobPath?.trim()) return

  buildParamsLoading[j.id] = true
  try {
    const html = await fetchBuildWithParamsPageHtml(
      settings.jenkinsUrl,
      settings.jenkinsUser,
      settings.jenkinsToken,
      j.jobPath,
      undefined,
    )
    const parsed = parseJenkinsBuildParameterFormHtml(html)
    if (!parsed.length) {
      msg[j.id] = '未解析到参数：请确认该 Job 为参数化构建，且当前账号可访问参数页。'
      rowCache[j.id] = []
      rowsToParams(j)
      markDirty(j.id)
      return
    }

    const fillUrlErrors: string[] = []
    for (const p of parsed) {
      const fu = p.fillUrl?.trim()
      if (!fu) continue
      try {
        const opts = await fetchJenkinsFillUrlOptions(
          settings.jenkinsUrl,
          settings.jenkinsUser,
          settings.jenkinsToken,
          fu,
        )
        if (opts.length) {
          const hasComposite = !!(p.compositePrefix?.trim() || p.compositeSuffix?.trim())
          if (hasComposite) {
            p.options = opts.map((t) =>
              joinCompositeParamValue(String(t).trim(), p.compositePrefix, p.compositeSuffix),
            )
            const firstComb = p.options[0] ?? ''
            p.value = p.options.includes(p.value) ? p.value : firstComb
          } else {
            p.options = opts
            p.value = opts.includes(p.value) ? p.value : (opts[0] ?? '')
          }
        }
      } catch (e) {
        fillUrlErrors.push(`${p.key}: ${(e as Error).message}`)
      }
    }

    const prevByKey = new Map<string, ParamRow>()
    for (const r of rowCache[j.id] || []) {
      const key = r.k.trim()
      if (key) prevByKey.set(key, { ...r })
    }

    rowCache[j.id] = parsed.map((p) => {
      const key = p.key.trim()
      const prev = prevByKey.get(key)
      if (prev) {
        return {
          k: p.key,
          v: prev.v,
          t: prev.t,
          dynamicLatest: prev.dynamicLatest,
          choiceLatest: prev.choiceLatest,
        }
      }
      return {
        k: p.key,
        v: p.value,
        t: p.type,
        dynamicLatest: p.type === 'dynamic' ? true : undefined,
        choiceLatest: p.type === 'choice' ? false : undefined,
      }
    })

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i]
      const row = rowCache[j.id]![i]
      if (p.options.length) {
        paramOptionCache[optionKey(j.id, p.key, row.t)] = [...p.options]
      }
    }

    rowsToParams(j)
    markDirty(j.id)
    msg[j.id] =
      fillUrlErrors.length > 0
        ? `已从 Jenkins 同步 ${parsed.length} 个构建参数。fillUrl 部分失败：${fillUrlErrors.join('；')}`
        : `已从 Jenkins 同步 ${parsed.length} 个构建参数。`
  } catch (e) {
    msg[j.id] = (e as Error).message
  } finally {
    buildParamsLoading[j.id] = false
  }
}

watchDebounced(
  () => {
    if (mode.value !== 'detail') return ''
    const j = curJob.value
    const p = j?.jobPath?.trim()
    if (!j || !p) return ''
    return `${j.id}::${p}`
  },
  async (key) => {
    if (!key) return
    if (mode.value !== 'detail') return
    const j = curJob.value
    if (!j) return
    await syncBuildParamsFromHtml(j)
  },
  { debounce: 650, maxWait: 4000 },
)

function defaultSelectorForParam(paramKey: string) {
  return defaultParamAutoFillSelectorString(paramKey)
}

function ensureDynamicAutoRule(j: JobConfig, paramKey: string) {
  const k = paramKey.trim()
  j.paramAutoFill ??= {}
  j.paramAutoFill[k] ??= {
    selector: defaultSelectorForParam(k),
    from: 'value',
    pick: 'first',
  }
  return j.paramAutoFill[k]!
}

function getParamOptions(jobId: string, paramKey: string, t: JobParamInputType): string[] {
  const k = paramKey?.trim()
  if (!k) return []
  return paramOptionCache[optionKey(jobId, k, t)] || []
}

function onParamOptionSelected(ev: Event, j: JobConfig, row: ParamRow) {
  row.v = (ev.target as HTMLSelectElement).value
  rowsToParams(j)
  markDirty(j.id)
}

function onLatestAtRunCheckbox(j: JobConfig, row: ParamRow, ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked
  if (row.t === 'dynamic') row.dynamicLatest = checked
  else if (row.t === 'choice') row.choiceLatest = checked
  rowsToParams(j)
  markDirty(j.id)
}

function onNextJobChange(ev: Event, j: JobConfig) {
  const v = (ev.target as HTMLSelectElement).value
  j.nextJobId = v ? v : null
  markDirty(j.id)
}

function addParamRow(j: JobConfig) {
  ensureRows(j)
  rowCache[j.id]!.push({ k: '', v: '', t: 'text' })
  markDirty(j.id)
}

function removeParamRow(j: JobConfig, idx: number) {
  ensureRows(j)
  const rows = rowCache[j.id]!
  rows.splice(idx, 1)
  rowsToParams(j)
  markDirty(j.id)
}

function addJobAndOpen() {
  const n = newJob()
  jobs.value = [...jobs.value, n]
  ensureRows(n)
  draftMap[n.id] = true
  aliasAutoSync[n.id] = true
  msg[n.id] = '已添加草稿，请点击「保存」写入本机。'
  openDetail(n.id)
}

function otherJobs(selfId: string) {
  return jobs.value.filter((j) => j.id !== selfId)
}

function remove(id: string) {
  if (!confirm('确定删除？')) return
  jobs.value = jobs.value.filter((j) => j.id !== id)
  delete rowCache[id]
  delete draftMap[id]
  delete aliasAutoSync[id]
  if (selectedJobId.value === id) goList()
  void persist()
}

async function persist() {
  for (const j of jobs.value) rowsToParams(j)
  await saveJobs([...jobs.value])
}

function saveOne(j: JobConfig) {
  ensureRows(j)
  rowsToParams(j)
  msg[j.id] = '保存中…'
  void saveJobs([...jobs.value])
    .then(() => {
      msg[j.id] = '已保存。'
      draftMap[j.id] = false
      toast({ title: '已保存', variant: 'success' })
      goList()
    })
    .catch((e) => {
      msg[j.id] = (e as Error).message
      toast({ title: '保存失败', description: msg[j.id], variant: 'error', timeoutMs: 2600 })
    })
}

</script>
