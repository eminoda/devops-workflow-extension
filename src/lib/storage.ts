import type { JobConfig, JenkinsSettings, RunRecord } from '@/types'
import { defaultSettings } from '@/types'

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

export async function appendRun(item: RunRecord): Promise<void> {
  const cur = await loadHistory()
  await saveHistory([item, ...cur])
}

export async function updateRun(
  id: string,
  patch: Partial<Pick<RunRecord, 'endTime' | 'buildNumber' | 'result' | 'error' | 'buildUrl'>>
): Promise<void> {
  const cur = await loadHistory()
  const i = cur.findIndex((r) => r.id === id)
  if (i < 0) return
  cur[i] = { ...cur[i], ...patch }
  await saveHistory(cur)
}
