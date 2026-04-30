<template>
  <div class="space-y-4">
    <div v-if="running" class="flex items-center gap-2">
      <Badge variant="secondary">运行中</Badge>
      <span class="text-xs text-muted-foreground">正在等待 Jenkins 完成…</span>
    </div>

    <NoJobsCard v-if="!jobs.length" @add="goJobs" />

    <div v-else class="space-y-3">
      <Card v-for="j in jobs" :key="j.id">
        <CardContent class="flex items-center justify-between gap-3 py-4">
          <div class="min-w-0">
            <button
              type="button"
              class="block w-full truncate text-left text-sm font-medium hover:underline"
              title="打开 Jenkins Job"
              @click="openJenkins(j)"
            >
              {{ j.name || '新 Job' }}
            </button>
            <div class="truncate font-mono text-xs text-muted-foreground">Job：{{ j.jobPath }}</div>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" size="icon" :disabled="running" title="运行" @click="run(j)">
              <Play class="h-4 w-4" />
            </Button>
            <Button v-if="j.verifyUrl" type="button" size="icon" variant="outline" title="业务站" @click="openUrl(j.verifyUrl!)">
              <ExternalLink class="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card v-if="logText">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">本次日志</CardTitle>
      </CardHeader>
      <CardContent>
        <pre
          class="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 font-mono text-xs"
        >{{ logText }}</pre>
      </CardContent>
    </Card>

    <Card class="border-0 shadow-none">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm">最近执行</CardTitle>
        <Button variant="ghost" size="sm" class="h-8 px-2 text-xs" type="button" @click="loadHist">刷新</Button>
      </CardHeader>
      <CardContent class="space-y-2">
        <p v-if="!history.length" class="text-sm text-muted-foreground">尚无记录</p>
        <Card v-for="h in history" :key="h.id" class="border-border/80">
          <CardContent class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ h.jobName }}</span>
                <span v-if="h.buildNumber" class="text-xs text-muted-foreground">#{{ h.buildNumber }}</span>
                <Badge v-if="h.result" :variant="badgeVariant(h.result)">{{ h.result }}</Badge>
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
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, Play } from 'lucide-vue-next'
import NoJobsCard from '@/components/NoJobsCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buildJobPageUrl } from '@/lib/jenkins'
import { loadHistory, loadJobs, loadSettings } from '@/lib/storage'
import type { BuildResult, JobConfig, RunRecord } from '@/types'
import { openUrlInNewTab, runJobAndMaybeChain } from '@/ui/composables/runPipeline'

const router = useRouter()

const jobs = ref<JobConfig[]>([])
const history = ref<RunRecord[]>([])
const running = ref(false)
const logText = ref('')

function goJobs() {
  void router.push('/jobs')
}

onMounted(async () => {
  jobs.value = await loadJobs()
  await loadHist()
})

async function loadHist() {
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

async function run(j: JobConfig) {
  logText.value = ''
  running.value = true
  try {
    await runJobAndMaybeChain(j.id, {
      onLog: (l) => {
        logText.value = (logText.value + l + '\n').slice(-8000)
      },
    })
  } catch (e) {
    logText.value += `\n[错误] ${(e as Error).message}\n`
  } finally {
    running.value = false
    await loadHist()
    await loadJobsInPlace()
  }
}

async function loadJobsInPlace() {
  jobs.value = await loadJobs()
}

async function openJenkins(j: JobConfig) {
  const s = await loadSettings()
  if (!s.jenkinsUrl) return
  const u = buildJobPageUrl(s.jenkinsUrl, j.jobPath)
  openUrlInNewTab(u)
}

function openUrl(u: string) {
  openUrlInNewTab(u)
}
</script>
