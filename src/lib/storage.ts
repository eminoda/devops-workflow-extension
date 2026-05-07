import { fetchBuildJson, fetchQueueItemJson } from '@/lib/jenkins'
import type { BuildResult, JobConfig, JenkinsSettings, RunRecord } from '@/types'
import { defaultSettings } from '@/types'

const JR_LOG = '[JenkinsRunner]'

function normalizeJenkinsResultLabel(raw: string | null | undefined): BuildResult {
  if (raw == null || String(raw).trim() === '') return null
  const u = String(raw).trim().toUpperCase()
  if (u === 'SUCCESS' || u === 'FAILURE' || u === 'ABORTED' || u === 'UNSTABLE') return u
  return null
}

/**
 * 对仍有 buildUrl 但本地未写入结束态的记录，向 Jenkins 拉一次 api/json；若已结束则补全 endTime/result/buildNumber。
 * 用于修复弹窗关闭、updateRun 未命中等导致的「一直执行中」与 curl 实际结果不一致。
 */
export async function reconcileStaleRunRecords(settings: JenkinsSettings): Promise<boolean> {
  if (
    !settings.jenkinsUrl?.trim() ||
    !String(settings.jenkinsUser ?? '').trim() ||
    !String(settings.jenkinsToken ?? '').trim()
  ) {
    console.warn(`${JR_LOG} reconcile 跳过：Jenkins 连接信息不完整`, {
      hasUrl: !!settings.jenkinsUrl?.trim(),
      hasUser: !!String(settings.jenkinsUser ?? '').trim(),
      hasToken: !!String(settings.jenkinsToken ?? '').trim(),
    })
    return false
  }

  const list = await loadHistory()
  console.log(`${JR_LOG} reconcile 开始`, { historyCount: list.length })
  const { jenkinsUser: user, jenkinsToken: token } = settings

  let changed = false
  const merged = await Promise.all(
    list.map(async (r0) => {
      let r: RunRecord = { ...r0 }
      if (r.endTime != null) return r

      // ① 尚无 buildUrl，但有入队时写入的 queueItemApiUrl：先请求队列项，补全 buildUrl
      if (!r.buildUrl?.trim() && r.queueItemApiUrl?.trim()) {
        try {
          const j = await fetchQueueItemJson(r.queueItemApiUrl!, user, token)
          if (j.executable?.url) {
            changed = true
            r = {
              ...r,
              buildUrl: j.executable.url,
              buildNumber: typeof j.executable.number === 'number' ? j.executable.number : r.buildNumber,
              queueItemApiUrl: null,
            }
            console.log(`${JR_LOG} reconcile 从队列 API 补全 buildUrl`, {
              id: r.id,
              jobName: r.jobName,
            })
          } else if (j.cancel) {
            changed = true
            console.log(`${JR_LOG} reconcile 队列项已取消`, { id: r.id, jobName: r.jobName })
            return {
              ...r,
              endTime: Date.now(),
              result: 'FAILURE' as BuildResult,
              error: r.error ?? '队列项已取消',
              queueItemApiUrl: null,
            }
          }
        } catch (e) {
          console.warn(`${JR_LOG} reconcile 队列项请求失败`, {
            id: r.id,
            message: (e as Error).message,
          })
        }
      }

      if (!r.buildUrl?.trim()) {
        if (r.endTime == null && !r.queueItemApiUrl?.trim()) {
          console.warn(
            `${JR_LOG} 本条记录既无 buildUrl 也无 queueItemApiUrl，无法向 Jenkins 查询；请重新触发一次构建（旧数据无队列信息）。`,
            { recordId: r.id, jobName: r.jobName, jobId: r.jobId },
          )
        }
        return r
      }

      // ② 已有 buildUrl：拉取该次构建 api/json
      try {
        const b = await fetchBuildJson(r.buildUrl!, user, token, settings.jenkinsUrl)
        if (!b.building) {
          const result = normalizeJenkinsResultLabel(b.result)
          changed = true
          console.log(`${JR_LOG} reconcile 构建已结束，写入本地`, {
            id: r.id,
            jobName: r.jobName,
            result: result ?? 'FAILURE',
          })
          return {
            ...r,
            endTime: Date.now(),
            result: result ?? 'FAILURE',
            buildNumber: typeof b.number === 'number' ? b.number : r.buildNumber,
          }
        }
        console.log(`${JR_LOG} reconcile Jenkins 仍 building=true`, {
          id: r.id,
          jobName: r.jobName,
          jenkinsResult: b.result,
        })
      } catch (e) {
        console.warn(`${JR_LOG} reconcile 请求失败`, {
          id: r.id,
          jobName: r.jobName,
          message: (e as Error).message,
        })
      }
      return r
    }),
  )

  if (changed) await saveHistory(merged)
  console.log(`${JR_LOG} reconcile 结束`, { changed, saved: changed })
  return changed
}

/** 导入/恢复存储后广播，供各视图刷新内存态 */
export const STORAGE_RELOAD_EVENT = 'jenkins-runner-reload-storage'

export function dispatchStorageReload(): void {
  window.dispatchEvent(new CustomEvent(STORAGE_RELOAD_EVENT))
}

const K_SETTINGS = 'devops_jenkins_settings'
const K_JOBS = 'devops_jenkins_jobs'
const K_HISTORY = 'devops_run_history'
const MAX_HISTORY = 50

export async function loadSettings(): Promise<JenkinsSettings> {
  const v = await chrome.storage.local.get(K_SETTINGS)
  return { ...defaultSettings(), ...(v[K_SETTINGS] as Partial<JenkinsSettings> | undefined) }
}

export async function saveSettings(s: JenkinsSettings): Promise<void> {
  await chrome.storage.local.set({ [K_SETTINGS]: s })
}

function normalizeJob(j: JobConfig): JobConfig {
  const id = typeof j.id === 'string' && j.id.trim() ? j.id : crypto.randomUUID()
  return {
    id,
    name: typeof j.name === 'string' ? j.name : '',
    jobPath: typeof j.jobPath === 'string' ? j.jobPath : '',
    displayParams: j.displayParams && typeof j.displayParams === 'object' && !Array.isArray(j.displayParams) ? j.displayParams : {},
    paramConfig: j.paramConfig && typeof j.paramConfig === 'object' && !Array.isArray(j.paramConfig) ? j.paramConfig : {},
    paramAutoFill: j.paramAutoFill && typeof j.paramAutoFill === 'object' && !Array.isArray(j.paramAutoFill) ? j.paramAutoFill : {},
    nextJobId: typeof j.nextJobId === 'string' && j.nextJobId.trim() ? j.nextJobId : null,
    lastSuccessParams:
      j.lastSuccessParams && typeof j.lastSuccessParams === 'object' && !Array.isArray(j.lastSuccessParams)
        ? j.lastSuccessParams
        : null,
    verifyUrl: typeof j.verifyUrl === 'string' ? j.verifyUrl : '',
  }
}

export interface BackupPayloadV1 {
  version: 1
  exportedAt: string
  settings: JenkinsSettings
  jobs: JobConfig[]
}

export async function buildBackupPayload(): Promise<BackupPayloadV1> {
  const [settings, jobs] = await Promise.all([loadSettings(), loadJobs()])
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...settings },
    jobs: jobs.map((j) => ({ ...normalizeJob(j) })),
  }
}

export async function exportBackupToFile(): Promise<void> {
  const payload = await buildBackupPayload()
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `jenkins-runner-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function mergeImportedSettings(raw: unknown): JenkinsSettings {
  const d = defaultSettings()
  if (!isPlainObject(raw)) return d
  return {
    ...d,
    jenkinsUrl: typeof raw.jenkinsUrl === 'string' ? raw.jenkinsUrl : d.jenkinsUrl,
    jenkinsUser: typeof raw.jenkinsUser === 'string' ? raw.jenkinsUser : d.jenkinsUser,
    jenkinsToken: typeof raw.jenkinsToken === 'string' ? raw.jenkinsToken : d.jenkinsToken,
    wecomWebhookGlobal: typeof raw.wecomWebhookGlobal === 'string' ? raw.wecomWebhookGlobal : d.wecomWebhookGlobal,
  }
}

export async function importBackupFromJsonString(text: string): Promise<void> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (!isPlainObject(data)) throw new Error('备份格式错误：根须为 JSON 对象')

  const settings = mergeImportedSettings(data.settings)
  const jobsRaw = data.jobs
  if (!Array.isArray(jobsRaw)) throw new Error('备份缺少 jobs 数组')

  const jobs: JobConfig[] = jobsRaw.map((item, i) => {
    if (!isPlainObject(item)) throw new Error(`jobs[${i}] 须为对象`)
    return normalizeJob(item as unknown as JobConfig)
  })

  await saveSettings(settings)
  await saveJobs(jobs)
  dispatchStorageReload()
}

export async function loadJobs(): Promise<JobConfig[]> {
  const v = await chrome.storage.local.get(K_JOBS)
  const list = v[K_JOBS] as JobConfig[] | undefined
  if (!Array.isArray(list)) return []
  return list.map(normalizeJob)
}

export async function saveJobs(jobs: JobConfig[]): Promise<void> {
  await chrome.storage.local.set({ [K_JOBS]: jobs })
}

export async function loadHistory(): Promise<RunRecord[]> {
  const v = await chrome.storage.local.get(K_HISTORY)
  const list = v[K_HISTORY] as RunRecord[] | undefined
  return Array.isArray(list) ? list : []
}

export async function saveHistory(list: RunRecord[]): Promise<void> {
  const trimmed = list.slice(0, MAX_HISTORY)
  await chrome.storage.local.set({ [K_HISTORY]: trimmed })
}

export async function clearRunHistory(): Promise<void> {
  await saveHistory([])
}

/** 本地运行历史写入变化时回调（含 background reconcile 更新） */
export function subscribeRunHistoryLocalChanges(callback: () => void): () => void {
  const fn: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area === 'local' && K_HISTORY in changes) callback()
  }
  chrome.storage.onChanged.addListener(fn)
  return () => chrome.storage.onChanged.removeListener(fn)
}

/** 同一 Job 再次执行时，先移除该 jobId 的旧记录，仅保留本次新插入的一条（避免历史列表堆叠同一任务） */
export async function appendRun(item: RunRecord): Promise<void> {
  const cur = await loadHistory()
  const rest = cur.filter((r) => r.jobId !== item.jobId)
  await saveHistory([item, ...rest])
}

export async function updateRun(
  id: string,
  patch: Partial<
    Pick<RunRecord, 'endTime' | 'buildNumber' | 'result' | 'error' | 'buildUrl' | 'queueItemApiUrl'>
  >,
): Promise<void> {
  const cur = await loadHistory()
  const i = cur.findIndex((r) => r.id === id)
  if (i < 0) return
  cur[i] = { ...cur[i], ...patch }
  await saveHistory(cur)
}
