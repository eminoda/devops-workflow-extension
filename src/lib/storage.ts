import type { JobConfig, JenkinsSettings, RunRecord } from '@/types'
import { defaultSettings } from '@/types'

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
  return {
    id: j.id,
    name: j.name,
    jobPath: j.jobPath,
    displayParams: j.displayParams ?? {},
    paramConfig: j.paramConfig ?? {},
    paramAutoFill: j.paramAutoFill ?? {},
    nextJobId: j.nextJobId ?? null,
    lastSuccessParams: j.lastSuccessParams ?? null,
    verifyUrl: j.verifyUrl ?? '',
  }
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
