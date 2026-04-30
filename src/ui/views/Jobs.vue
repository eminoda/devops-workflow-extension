<template>
  <div class="space-y-4">
    <!-- 列表页 -->
    <template v-if="mode === 'list'">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-sm font-semibold">Job 管理</h1>
        <Button type="button" size="sm" @click="addJobAndOpen">
          <Plus class="h-4 w-4" />
          新建
        </Button>
      </div>

      <NoJobsCard v-if="!jobs.length" @add="addJobAndOpen" />

      <div v-else class="space-y-3">
        <Card v-for="j in jobs" :key="j.id" class="border-0 shadow-none">
          <CardContent class="py-4">
            <button type="button" class="flex w-full items-center justify-between gap-3 text-left" @click="openDetail(j.id)">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <div class="truncate text-sm font-medium">{{ j.name || '新 Job' }}</div>
                  <Badge v-if="draftMap[j.id]" variant="secondary" class="shrink-0">草稿</Badge>
                </div>
                <div class="truncate font-mono text-xs text-muted-foreground">Job：{{ j.jobPath || '（未填写）' }}</div>
              </div>
              <div class="shrink-0 text-muted-foreground">
                <ChevronRight class="h-4 w-4" />
              </div>
            </button>
          </CardContent>
        </Card>
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
              <Label :for="`path-${curJob.id}`">Jenkins Job 名称</Label>
              <Input
                :id="`path-${curJob.id}`"
                v-model="curJob.jobPath"
                class="font-mono text-xs"
                placeholder="例如：TEST-admin-web"
                @input="markDirty(curJob.id)"
              />
            </div>
            <div class="space-y-2">
              <Label :for="`name-${curJob.id}`">别名</Label>
              <Input :id="`name-${curJob.id}`" v-model="curJob.name" placeholder="默认 Job 名称" @input="markDirty(curJob.id)" />
            </div>
          </div>

          <div class="space-y-2">
            <Label>构建参数</Label>
            <p class="text-xs text-muted-foreground">参数名需与 Jenkins 配置完全一致（大小写敏感）。</p>
            <Button
              variant="ghost"
              class="w-full justify-center border border-dashed border-border/70 text-muted-foreground hover:text-foreground"
              type="button"
              @click="openParamDraft(curJob)"
            >
              <Plus class="h-4 w-4" />
              添加参数
            </Button>

            <div v-if="paramDraft[curJob.id]?.open" class="space-y-3 rounded-md bg-background p-3">
              <div class="space-y-2">
                <Label class="text-xs">参数名称</Label>
                <Input
                  v-model="paramDraft[curJob.id].k"
                  class="font-mono text-xs"
                  placeholder="如：branch / REGION / DOCKER_IMAGE"
                />
              </div>

              <div class="space-y-2">
                <Label class="text-xs">类型</Label>
                <p v-if="!paramDraft[curJob.id].k.trim()" class="text-xs text-muted-foreground">
                  先填写「参数名称」后再选择类型
                </p>
                <div class="grid grid-cols-3 gap-2">
                  <label
                    class="flex items-center gap-2 px-1 py-2 text-xs"
                    :class="!paramDraft[curJob.id].k.trim() ? 'opacity-50' : ''"
                  >
                    <input
                      type="radio"
                      name="param-type"
                      value="text"
                      :disabled="!paramDraft[curJob.id].k.trim()"
                      :checked="paramDraft[curJob.id]?.t === 'text'"
                      @change="setParamDraftType(curJob, 'text')"
                    />
                    文本
                  </label>
                  <label
                    class="flex items-center gap-2 px-1 py-2 text-xs"
                    :class="!paramDraft[curJob.id].k.trim() ? 'opacity-50' : ''"
                  >
                    <input
                      type="radio"
                      name="param-type"
                      value="choice"
                      :disabled="!paramDraft[curJob.id].k.trim()"
                      :checked="paramDraft[curJob.id]?.t === 'choice'"
                      @change="setParamDraftType(curJob, 'choice')"
                    />
                    选项
                  </label>
                  <label
                    class="flex items-center gap-2 px-1 py-2 text-xs"
                    :class="!paramDraft[curJob.id].k.trim() ? 'opacity-50' : ''"
                  >
                    <input
                      type="radio"
                      name="param-type"
                      value="dynamic"
                      :disabled="!paramDraft[curJob.id].k.trim()"
                      :checked="paramDraft[curJob.id]?.t === 'dynamic'"
                      @change="setParamDraftType(curJob, 'dynamic')"
                    />
                    动态参数
                  </label>
                </div>
              </div>

              <div class="space-y-2">
                <Label class="text-xs">参数值</Label>
                <template v-if="paramDraft[curJob.id].t !== 'text' && paramDraft[curJob.id].options.length">
                  <select
                    :class="cn(selectCls, 'w-full text-xs')"
                    :value="paramDraft[curJob.id].v"
                    @change="paramDraft[curJob.id].v = ($event.target as HTMLSelectElement).value"
                  >
                    <option v-for="opt in paramDraft[curJob.id].options" :key="opt" :value="opt">
                      {{ opt }}
                    </option>
                  </select>
                </template>
                <template v-else>
                  <Input v-model="paramDraft[curJob.id].v" class="text-xs" placeholder="如：master / dev" />
                </template>
              </div>

              <div v-if="paramDraft[curJob.id].t === 'dynamic'" class="flex items-center gap-2">
                <label class="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    :checked="paramDraft[curJob.id].dynamicLatest"
                    @change="paramDraft[curJob.id].dynamicLatest = ($event.target as HTMLInputElement).checked"
                  />
                  执行时获取最新数据
                </label>
              </div>

              <div v-if="paramDraft[curJob.id].t !== 'text'" class="flex items-center gap-2">
                <span v-if="paramDraft[curJob.id].loading" class="text-xs text-muted-foreground">加载中…</span>
                <span v-else-if="paramDraft[curJob.id].error" class="text-xs text-destructive break-all">{{ paramDraft[curJob.id].error }}</span>
                <span v-else-if="paramDraft[curJob.id].options.length" class="text-xs text-muted-foreground"
                  >已加载 {{ paramDraft[curJob.id].options.length }} 项（默认取第一项）</span
                >
              </div>

              <div class="flex gap-2">
                <Button class="flex-1" size="sm" type="button" @click="confirmAddParam(curJob)">添加</Button>
                <Button class="flex-1" size="sm" variant="outline" type="button" @click="closeParamDraft(curJob)"
                  >取消</Button
                >
              </div>
            </div>

            <div v-for="(row, idx) in rowCache[curJob.id] || []" :key="idx" class="flex gap-2">
              <Input v-model="row.k" class="flex-1 font-mono text-xs" placeholder="参数名" @input="onRowChange(curJob)" />

              <template v-if="row.t !== 'text' && getParamOptions(curJob.id, row.k, row.t).length">
                <select
                  :class="cn(selectCls, 'flex-1 text-xs')"
                  :value="row.v"
                  @change="onParamOptionSelected($event, curJob, row)"
                >
                  <option v-for="opt in getParamOptions(curJob.id, row.k, row.t)" :key="opt" :value="opt">
                    {{ opt }}
                  </option>
                </select>
              </template>
              <template v-else>
                <Input v-model="row.v" class="flex-1 text-xs" placeholder="参数值" @input="onRowChange(curJob)" />
              </template>

              <Button variant="outline" size="icon" class="shrink-0" type="button" @click="removeParamRow(curJob, idx)">
                <X class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          <div class="space-y-2">
            <Label :for="`next-${curJob.id}`">关联 Job</Label>
            <select :id="`next-${curJob.id}`" :value="curJob.nextJobId ?? ''" :class="selectCls" @change="onNextJobChange($event, curJob)">
              <option value="">（不关联）</option>
              <option v-for="o in otherJobs(curJob.id)" :key="o.id" :value="o.id">
                {{ o.name || o.id }}
              </option>
            </select>
          </div>

          <div class="space-y-2">
            <Label :for="`vu-${curJob.id}`">验证/业务站 URL</Label>
            <Input :id="`vu-${curJob.id}`" v-model="curJob.verifyUrl" type="url" placeholder="例如：https://xxx.xxx.com/（可选）" />
          </div>

          <p v-if="curJob.lastSuccessParams" class="text-xs text-muted-foreground">
            上次成功：
            <code class="rounded bg-muted px-1 py-0.5">{{ JSON.stringify(curJob.lastSuccessParams) }}</code>
          </p>

          <p v-if="msg[curJob.id]" class="text-xs text-amber-700">{{ msg[curJob.id] }}</p>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Save, Trash2, X } from 'lucide-vue-next'
import NoJobsCard from '@/components/NoJobsCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { fetchBuildWithParamsPageHtml, fetchChoiceParameterChoices } from '@/lib/jenkins'
import { cn } from '@/lib/utils'
import { loadJobs, loadSettings, saveJobs } from '@/lib/storage'
import { toast } from '@/ui/toast'
import type { JobConfig, JobParamConfig, JobParamInputType } from '@/types'

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
const mode = ref<'list' | 'detail'>('list')
const selectedJobId = ref<string | null>(null)
const curJob = computed(() => jobs.value.find((j) => j.id === selectedJobId.value) ?? null)
type ParamRow = { k: string; v: string; t: JobParamInputType; dynamicLatest?: boolean }
const rowCache = reactive<Record<string, ParamRow[]>>({})
const msg = reactive<Record<string, string>>({})
const draftMap = reactive<Record<string, boolean>>({})

const paramOptionCache = reactive<Record<string, string[]>>({})
const paramOptionLoading = reactive<Record<string, boolean>>({})
const paramOptionError = reactive<Record<string, string>>({})

const paramDraft = reactive<
  Record<
    string,
    {
      open: boolean
      t: JobParamInputType
      k: string
      v: string
      options: string[]
      loading: boolean
      error: string
      dynamicLatest: boolean
    }
  >
>({})

onMounted(async () => {
  jobs.value = await loadJobs()
  for (const j of jobs.value) ensureRows(j)
  for (const j of jobs.value) draftMap[j.id] = false
})

function goList() {
  mode.value = 'list'
  selectedJobId.value = null
}

function openDetail(id: string) {
  const j = jobs.value.find((x) => x.id === id)
  if (j) ensureRows(j)
  selectedJobId.value = id
  mode.value = 'detail'
}

function markDirty(id: string) {
  draftMap[id] = true
}

function ensureRows(j: JobConfig) {
  if (!rowCache[j.id]) {
    const d = j.displayParams || {}
    const entries = Object.entries(d)
    rowCache[j.id] = entries.length
      ? entries.map(([k, v]) => {
          const t = (j.paramConfig?.[k]?.type ?? (j.paramAutoFill?.[k] ? 'dynamic' : 'text')) as JobParamInputType
          const dynamicLatest = j.paramConfig?.[k]?.dynamicLatest ?? true
          return { k, v: String(v), t, dynamicLatest }
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
    cfg[key] = { type: r.t, dynamicLatest: r.t === 'dynamic' ? (r.dynamicLatest ?? true) : undefined }

    // 动态参数：同步 autoFill 规则（运行时也会自动取最新 option 的 value）
    if (r.t === 'dynamic') {
      if (cfg[key].dynamicLatest !== false) ensureDynamicAutoRule(j, key)
      else if (j.paramAutoFill[key]) delete j.paramAutoFill[key]
    } else {
      // 非动态：移除残留规则，避免意外覆盖
      if (j.paramAutoFill[key]) delete j.paramAutoFill[key]
    }
  }
  j.displayParams = p
  j.paramConfig = cfg
  markDirty(j.id)
}

function onRowChange(j: JobConfig) {
  rowsToParams(j)
}

function optionKey(jobId: string, paramKey: string, t: JobParamInputType) {
  return `${jobId}:${t}:${paramKey}`
}

function defaultSelectorForParam(paramKey: string) {
  const safe = paramKey.replaceAll('"', '\\"')
  // Jenkins 参数页常见 DOM 结构：
  // <input value="PARAM"> 的 nextElementSibling 是 <select>，或 nextElementSibling 内部再包一层 <div><select/></div>
  // 这里保留 selector 作为兜底（运行时/抓取失败时仍可用），但 UI 抓取会优先按 DOM 同级关系解析。
  return `input[value="${safe}"] + select, input[value="${safe}"] + * select`
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
}

async function loadParamOptions(j: JobConfig, row: ParamRow) {
  const paramKey = row.k?.trim()
  if (!paramKey) return
  if (row.t === 'text') return
  const k = optionKey(j.id, paramKey, row.t)

  paramOptionError[k] = ''
  paramOptionLoading[k] = true
  try {
    const settings = await loadSettings()
    if (!settings.jenkinsUrl || !settings.jenkinsUser || !settings.jenkinsToken) {
      throw new Error('请先在「基础配置」中填写 Jenkins 地址、用户与 API Token')
    }
    if (!j.jobPath?.trim()) throw new Error('请先填写 Jenkins Job 名称')

    let opts: string[] = []
    if (row.t === 'choice') {
      opts = await fetchChoiceParameterChoices(
        settings.jenkinsUrl,
        settings.jenkinsUser,
        settings.jenkinsToken,
        j.jobPath,
        paramKey
      )
    } else if (row.t === 'dynamic') {
      const rule = ensureDynamicAutoRule(j, paramKey)
      const html = await fetchBuildWithParamsPageHtml(
        settings.jenkinsUrl,
        settings.jenkinsUser,
        settings.jenkinsToken,
        j.jobPath,
        undefined
      )
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const input = doc.querySelector(`input[value="${paramKey.replaceAll('"', '\\"')}"]`) as HTMLInputElement | null
      const container =
        (input?.closest?.('div[name="parameter"]') as HTMLElement | null) ??
        (input?.parentElement as HTMLElement | null)

      const select = (container?.querySelector?.('select') as HTMLSelectElement | null) ?? null

      if (select) {
        opts = Array.from(select.options)
          .map((o) => String(o.value || '').trim())
          .filter(Boolean)
      } else {
        // 兜底：使用 selector 查询
        const nodes = Array.from(doc.querySelectorAll(rule.selector))
        if (!nodes.length) {
          throw new Error(`未找到 parent/容器 select，且 selector 未匹配：${rule.selector}`)
        }
        const picked = nodes[0]
        const sel =
          picked instanceof HTMLSelectElement
            ? picked
            : (picked instanceof HTMLElement ? picked.querySelector('select') : null)
        if (!sel) throw new Error('未找到 select 元素')
        opts = Array.from(sel.options)
          .map((o) => String(o.value || '').trim())
          .filter(Boolean)
      }
    }

    if (!opts.length) throw new Error('下拉 option 为空')
    paramOptionCache[k] = opts

    // 默认取第一个，并同步到参数值
    row.v = opts[0]
    rowsToParams(j)
    msg[j.id] = '已加载下拉选项（默认取第一项）。如需持久化规则，请点击「保存」。'
  } catch (e) {
    paramOptionError[k] = (e as Error).message
  } finally {
    paramOptionLoading[k] = false
  }
}

function ensureDraft(jobId: string) {
  if (!paramDraft[jobId]) {
    paramDraft[jobId] = { open: false, t: 'text', k: '', v: '', options: [], loading: false, error: '', dynamicLatest: true }
  }
  return paramDraft[jobId]
}

function openParamDraft(j: JobConfig) {
  const d = ensureDraft(j.id)
  d.open = true
  d.t = 'text'
  d.k = ''
  d.v = ''
  d.options = []
  d.loading = false
  d.error = ''
  d.dynamicLatest = true
}

function closeParamDraft(j: JobConfig) {
  const d = ensureDraft(j.id)
  d.open = false
}

function setParamDraftType(j: JobConfig, t: JobParamInputType) {
  const d = ensureDraft(j.id)
  d.t = t
  d.options = []
  d.v = ''
  d.error = ''
  if (t === 'dynamic') d.dynamicLatest = true
  if (t !== 'text') {
    // 切到「选项/动态参数」时自动加载（基于已填写的参数名）
    void loadDraftOptions(j)
  }
}

async function loadDraftOptions(j: JobConfig) {
  const d = ensureDraft(j.id)
  const paramKey = d.k.trim()
  if (!paramKey) {
    d.error = '请先填写参数名称'
    return
  }
  if (d.t === 'text') return

  d.error = ''
  d.loading = true
  try {
    const settings = await loadSettings()
    if (!settings.jenkinsUrl || !settings.jenkinsUser || !settings.jenkinsToken) {
      throw new Error('请先在「基础配置」中填写 Jenkins 地址、用户与 API Token')
    }
    if (!j.jobPath?.trim()) throw new Error('请先填写 Jenkins Job 名称')

    let opts: string[] = []
    if (d.t === 'choice') {
      opts = await fetchChoiceParameterChoices(
        settings.jenkinsUrl,
        settings.jenkinsUser,
        settings.jenkinsToken,
        j.jobPath,
        paramKey
      )
    } else if (d.t === 'dynamic') {
      const html = await fetchBuildWithParamsPageHtml(
        settings.jenkinsUrl,
        settings.jenkinsUser,
        settings.jenkinsToken,
        j.jobPath,
        undefined
      )
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const input = doc.querySelector(`input[value="${paramKey.replaceAll('"', '\\"')}"]`) as HTMLInputElement | null
      const container =
        (input?.closest?.('div[name="parameter"]') as HTMLElement | null) ??
        (input?.parentElement as HTMLElement | null)
      const select = (container?.querySelector?.('select') as HTMLSelectElement | null) ?? null

      if (!select) throw new Error('未找到 parent/容器 select')
      opts = Array.from(select.options).map((o) => String(o.value || '').trim()).filter(Boolean)
    }

    if (!opts.length) throw new Error('下拉 option 为空')
    d.options = opts
    d.v = opts[0]
  } catch (e) {
    d.error = (e as Error).message
  } finally {
    d.loading = false
  }
}

function confirmAddParam(j: JobConfig) {
  const d = ensureDraft(j.id)
  const k = d.k.trim()
  if (!k) {
    d.error = '请填写参数名称'
    return
  }
  // 若同名已存在：覆盖其配置/值
  ensureRows(j)
  const rows = rowCache[j.id]!
  const idx = rows.findIndex((r) => r.k.trim() === k)
  const next: ParamRow = { k, v: d.v ?? '', t: d.t, dynamicLatest: d.t === 'dynamic' ? d.dynamicLatest : undefined }
  if (idx >= 0) rows[idx] = next
  else rows.push(next)

  // 同步类型配置与动态规则
  rowsToParams(j)
  d.open = false
  msg[j.id] = '已添加参数，请点击「保存」写入本机。'
}

function onNextJobChange(ev: Event, j: JobConfig) {
  const v = (ev.target as HTMLSelectElement).value
  j.nextJobId = v ? v : null
}

function addParamRow(j: JobConfig) {
  ensureRows(j)
  rowCache[j.id]!.push({ k: '', v: '', t: 'text' })
}

function removeParamRow(j: JobConfig, idx: number) {
  ensureRows(j)
  const rows = rowCache[j.id]!
  rows.splice(idx, 1)
  rowsToParams(j)
}

function addJobAndOpen() {
  const n = newJob()
  jobs.value = [...jobs.value, n]
  ensureRows(n)
  draftMap[n.id] = true
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
