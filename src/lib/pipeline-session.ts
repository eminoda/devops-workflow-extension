/** Popup / options 与 service worker 共用的流水线 UI 快照（chrome.storage.session） */

export type PipelineSessionState = {
  busy: boolean
  log: string
  activeBuildUrl: string | null
  /** 当前「本次日志」归属的运行记录 id（与 RunRecord.id 一致） */
  activeRunId: string | null
}

const KEY = 'jenkins_runner_pipeline_ui'

/** 供 UI 侧 `storage.session.onChanged` 过滤 */
export const PIPELINE_SESSION_KEY = KEY

function defaultState(): PipelineSessionState {
  return { busy: false, log: '', activeBuildUrl: null, activeRunId: null }
}

export async function readPipelineSession(): Promise<PipelineSessionState> {
  const v = await chrome.storage.session.get(KEY)
  const s = v[KEY] as Partial<PipelineSessionState> | undefined
  if (!s || typeof s !== 'object') return defaultState()
  return {
    busy: !!s.busy,
    log: typeof s.log === 'string' ? s.log : '',
    activeBuildUrl:
      s.activeBuildUrl != null && typeof s.activeBuildUrl === 'string' ? s.activeBuildUrl : null,
    activeRunId: s.activeRunId != null && typeof s.activeRunId === 'string' ? s.activeRunId : null,
  }
}

export async function patchPipelineSession(patch: Partial<PipelineSessionState>): Promise<void> {
  const cur = await readPipelineSession()
  await chrome.storage.session.set({ [KEY]: { ...cur, ...patch } })
}

/** 串行追加日志，避免并发写 session 互相覆盖 */
let logChain: Promise<void> = Promise.resolve()

export function appendPipelineSessionLogLine(line: string): Promise<void> {
  logChain = logChain.then(async () => {
    const cur = await readPipelineSession()
    const log = (cur.log + line + '\n').slice(-8000)
    await chrome.storage.session.set({ [KEY]: { ...cur, log } })
  })
  return logChain
}
