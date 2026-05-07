import { stopJenkinsBuild } from '@/lib/jenkins'
import {
  appendPipelineSessionLogLine,
  patchPipelineSession,
  readPipelineSession,
} from '@/lib/pipeline-session'
import { loadHistory, loadSettings, reconcileStaleRunRecords } from '@/lib/storage'
import type { RunRecord } from '@/types'
import { runJobAndMaybeChain } from '@/ui/composables/runPipeline'

const RECONCILE_MS = 4000

function isRunningHistoryRow(h: RunRecord): boolean {
  if (h.endTime != null) return false
  const r = h.result
  if (r == null) return true
  if (typeof r === 'string' && !r.trim()) return true
  return false
}

async function tickReconcile(): Promise<void> {
  const settings = await loadSettings()
  if (
    !settings.jenkinsUrl?.trim() ||
    !String(settings.jenkinsUser ?? '').trim() ||
    !String(settings.jenkinsToken ?? '').trim()
  ) {
    return
  }
  const session = await readPipelineSession()
  const list = await loadHistory()
  const staleRunning = list.some(
    (h) =>
      isRunningHistoryRow(h) &&
      (!!(h.buildUrl ?? '').trim() || !!(h.queueItemApiUrl ?? '').trim()),
  )
  if (!session.busy && !staleRunning) return
  await reconcileStaleRunRecords(settings)
}

setInterval(() => {
  void tickReconcile().catch((e) => console.warn('[JenkinsRunner] background reconcile', e))
}, RECONCILE_MS)
void tickReconcile().catch((e) => console.warn('[JenkinsRunner] background reconcile (initial)', e))

type BgMessage = { type: 'PIPELINE_START'; jobId: string } | { type: 'PIPELINE_STOP' }

chrome.runtime.onInstalled.addListener(() => {
  // noop；保留钩子便于日后版本迁移
})

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as BgMessage
  if (m?.type === 'PIPELINE_START') {
    void handlePipelineStart(m.jobId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }))
    return true
  }
  if (m?.type === 'PIPELINE_STOP') {
    void handlePipelineStop()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }))
    return true
  }
  return false
})

async function handlePipelineStart(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const id = String(jobId ?? '').trim()
  if (!id) return { ok: false, error: '缺少 jobId' }
  const cur = await readPipelineSession()
  if (cur.busy) return { ok: false, error: '已有流水线在执行中' }
  await patchPipelineSession({ busy: true, log: '', activeBuildUrl: null })
  void executePipelineInBackground(id)
  return { ok: true }
}

async function executePipelineInBackground(startJobId: string): Promise<void> {
  try {
    await runJobAndMaybeChain(startJobId, {
      onLog: (line) => void appendPipelineSessionLogLine(line),
      onBuildAllocated: ({ buildUrl }) => void patchPipelineSession({ activeBuildUrl: buildUrl }),
    })
  } catch (e) {
    await appendPipelineSessionLogLine(`[错误] ${(e as Error).message}`)
  } finally {
    await patchPipelineSession({ busy: false, activeBuildUrl: null })
  }
}

async function handlePipelineStop(): Promise<{ ok: boolean; error?: string }> {
  const session = await readPipelineSession()
  const u = (session.activeBuildUrl ?? '').trim()
  if (!u) return { ok: false, error: '当前无已分配的构建 URL' }
  const settings = await loadSettings()
  if (!settings.jenkinsUrl?.trim() || !settings.jenkinsUser || !settings.jenkinsToken) {
    return { ok: false, error: '请先在「基础配置」中填写 Jenkins 地址、用户与 API Token' }
  }
  await stopJenkinsBuild(settings.jenkinsUrl, settings.jenkinsUser, settings.jenkinsToken, u)
  return { ok: true }
}
