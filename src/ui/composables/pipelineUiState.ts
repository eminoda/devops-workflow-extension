import { ref } from 'vue'
import { PIPELINE_SESSION_KEY, readPipelineSession, type PipelineSessionState } from '@/lib/pipeline-session'

/** 任意页面展示用：与 chrome.storage.session 同步 */
export const pipelineUiBusy = ref(false)
export const pipelineUiLog = ref('')
export const pipelineUiActiveBuildUrl = ref<string | null>(null)

function applySession(s: PipelineSessionState) {
  pipelineUiBusy.value = s.busy
  pipelineUiLog.value = s.log
  pipelineUiActiveBuildUrl.value = s.activeBuildUrl
}

export async function refreshPipelineUiFromSession(): Promise<void> {
  applySession(await readPipelineSession())
}

let sessionListenerRegistered = false

/** 在扩展 UI 入口调用一次：拉取 session 并订阅变更 */
export function registerPipelineSessionSync(): void {
  if (sessionListenerRegistered) return
  sessionListenerRegistered = true
  void refreshPipelineUiFromSession()
  chrome.storage.session.onChanged.addListener((changes) => {
    if (!(PIPELINE_SESSION_KEY in changes)) return
    const nv = changes[PIPELINE_SESSION_KEY]?.newValue as Partial<PipelineSessionState> | undefined
    if (!nv || typeof nv !== 'object') return
    applySession({
      busy: !!nv.busy,
      log: typeof nv.log === 'string' ? nv.log : '',
      activeBuildUrl:
        nv.activeBuildUrl != null && typeof nv.activeBuildUrl === 'string' ? nv.activeBuildUrl : null,
    })
  })
}

type PipelineAck = { ok: boolean; error?: string }

export async function runJobFromUi(jobId: string): Promise<void> {
  const res = (await chrome.runtime.sendMessage({
    type: 'PIPELINE_START',
    jobId,
  })) as PipelineAck
  if (!res?.ok) throw new Error(res?.error ?? '启动流水线失败')
  await refreshPipelineUiFromSession()
}

export async function requestStopActivePipelineBuild(): Promise<PipelineAck> {
  return (await chrome.runtime.sendMessage({ type: 'PIPELINE_STOP' })) as PipelineAck
}
