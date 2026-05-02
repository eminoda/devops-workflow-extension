import { joinUrl, normalizeJobPath, sleep, trimJenkinsBase } from './jenkins-utils'

/** UTF-8 安全，兼容非 ASCII 用户名/密码/Token 片段 */
function toBase64Basic(raw: string): string {
  const b = new TextEncoder().encode(raw)
  let bin = ''
  for (const c of b) {
    bin += String.fromCharCode(c)
  }
  return btoa(bin)
}

function basicAuthHeader(user: string, token: string): string {
  return `Basic ${toBase64Basic(`${user}:${token}`)}`
}

export interface JobParameterDefinition {
  name?: string
  type?: string
  choices?: string[]
}

/**
 * 从 Jenkins job api/json 中读取 Choice 参数的 choices。
 * 等价于：
 * /api/json?pretty=true&tree=property[parameterDefinitions[name,type,choices]]
 */
export async function fetchChoiceParameterChoices(
  jenkinsBase: string,
  user: string,
  token: string,
  jobPath: string,
  paramName: string
): Promise<string[]> {
  const base = trimJenkinsBase(jenkinsBase)
  const path = `${normalizeJobPath(jobPath)}/api/json?pretty=true&tree=property[parameterDefinitions[name,type,choices]]`
  const url = joinUrl(base, path)
  const r = await fetch(url, { headers: { Authorization: basicAuthHeader(user, token) } })
  const text = await r.text().catch(() => '')
  try {
    const j = JSON.parse(text) as any
    const props: any[] = Array.isArray(j?.property) ? j.property : []
    for (const p of props) {
      const defs: JobParameterDefinition[] = Array.isArray(p?.parameterDefinitions) ? p.parameterDefinitions : []
      const hit = defs.find((d) => d?.name === paramName)
      if (hit && Array.isArray(hit.choices)) {
        return hit.choices.map((s) => String(s).trim()).filter(Boolean)
      }
    }
    return []
  } catch {
    throw new Error(`读取 choices 失败: ${r.status} ${(text || '').slice(0, 200)}`)
  }
}

export interface Crumb {
  crumbRequestField: string
  crumb: string
}

export async function fetchCrumb(
  jenkinsBase: string,
  user: string,
  token: string
): Promise<Crumb | null> {
  const u = joinUrl(jenkinsBase, 'crumbIssuer/api/json')
  const r = await fetch(u, { headers: { Authorization: basicAuthHeader(user, token) } })
  if (!r.ok) return null
  return (await r.json()) as Crumb
}

/**
 * POST `{buildUrl}/stop`，终止该次构建（需 Basic；若 Jenkins 启用 CSRF 则自动带 crumb）。
 * buildUrl 一般为 `https://…/job/…/N/` 形式。
 */
export async function stopJenkinsBuild(
  jenkinsBase: string,
  user: string,
  token: string,
  buildUrl: string,
): Promise<void> {
  const base = trimJenkinsBase(jenkinsBase)
  const stopUrl = `${buildUrl.replace(/\/?$/, '')}/stop`
  const auth = basicAuthHeader(user, token)
  const post = async (crumbH: Crumb | null) => {
    const headers: Record<string, string> = {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    }
    if (crumbH) headers[crumbH.crumbRequestField] = crumbH.crumb
    return fetch(stopUrl, { method: 'POST', headers, body: '' })
  }
  let r = await post(null)
  if (r.status === 403) {
    const t = await r.text().catch(() => '')
    if (/no valid crumb|valid crumb|csrf|crumb/i.test(t) || t.length < 1) {
      const c = await fetchCrumb(base, user, token)
      if (c) r = await post(c)
    }
  }
  if (!r.ok && r.status !== 302) {
    const t = await r.text().catch(() => '')
    throw new Error(`停止构建失败: ${r.status} ${(t || '').slice(0, 400)}`)
  }
}

/**
 * 触发参数化构建，返回 queue item 的 `.../queue/item/xxx/api/json` URL
 */
export async function triggerParameterizedBuild(
  jenkinsBase: string,
  user: string,
  token: string,
  jobPath: string,
  params: Record<string, string>
): Promise<string> {
  const base = trimJenkinsBase(jenkinsBase)
  const path = `${normalizeJobPath(jobPath)}/buildWithParameters`
  const url = joinUrl(base, path)
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null) body.set(k, v)
  }

  const auth = basicAuthHeader(user, token)
  const post = async (crumbH?: Crumb) => {
    const headers: Record<string, string> = {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    }
    if (crumbH) {
      headers[crumbH.crumbRequestField] = crumbH.crumb
    }
    return fetch(url, { method: 'POST', headers, body: body.toString() })
  }

  let r = await post()
  if (r.status === 403) {
    const t = await r.text()
    if (/no valid crumb|valid crumb|csrf|crumb/i.test(t) || t.length < 1) {
      const c = await fetchCrumb(base, user, token)
      if (c) {
        r = await post(c)
      }
    } else {
      r = new Response(t, { status: 403, statusText: r.statusText })
    }
  }

  if (r.status !== 201 && r.status !== 200) {
    const t = await r.text().catch(() => '')
    throw new Error(`触发构建失败: ${r.status} ${(t || '').slice(0, 400)}`)
  }

  const loc = r.headers.get('location')
  if (!loc) {
    throw new Error('Jenkins 未返回 Location 队列头。请检查任务是否启用参数化、参数名与 Jenkins 一致。')
  }
  return toQueueItemApiUrl(base, loc)
}

function toQueueItemApiUrl(jenkinsBase: string, location: string): string {
  const origin = new URL(trimJenkinsBase(jenkinsBase)).origin
  let p = location.trim()
  if (p.startsWith('/')) p = origin + p
  p = p.replace(/\/$/, '')
  if (!p.endsWith('/api/json')) p += '/api/json'
  return p
}

export interface QueueItemJson {
  cancel?: boolean
  why?: string | null
  executable?: { number: number; url: string } | null
}

/** 单次 GET 队列项 JSON（不等待）；用于 reconcile 从 queueItemApiUrl 补全 buildUrl */
export async function fetchQueueItemJson(
  queueItemApiUrl: string,
  user: string,
  token: string,
): Promise<QueueItemJson> {
  const auth = basicAuthHeader(user, token)
  const r = await fetch(queueItemApiUrl, { headers: { Authorization: auth } })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`读取队列项失败: ${r.status} ${t.slice(0, 200)}`)
  }
  return (await r.json()) as QueueItemJson
}

export async function pollQueueItem(
  queueItemApiUrl: string,
  user: string,
  token: string,
  opts: { maxWaitMs?: number; intervalMs?: number } = {},
): Promise<{ buildNumber: number; buildUrl: string }> {
  const { maxWaitMs = 2 * 60 * 60 * 1000, intervalMs = 2000 } = opts
  const start = Date.now()
  for (;;) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error('等待 Jenkins 入队超时')
    }
    const j = await fetchQueueItemJson(queueItemApiUrl, user, token)
    if (j.executable) {
      return { buildNumber: j.executable.number, buildUrl: j.executable.url }
    }
    if (j.cancel) {
      throw new Error('队列项已取消')
    }
    await sleep(intervalMs)
  }
}

export interface BuildJson {
  building: boolean
  result: string | null
  number: number
  url: string
}

/**
 * @param jenkinsBase 可选；当 buildUrl 为站点内相对路径（常见于 queue api 返回的 executable.url）时，
 * 扩展页内 fetch 必须拼成绝对 URL，否则会相对 chrome-extension:// 发请求导致失败。
 */
export async function fetchBuildJson(
  buildUrl: string,
  user: string,
  token: string,
  jenkinsBase?: string,
): Promise<BuildJson> {
  let root = buildUrl.trim()
  if (jenkinsBase?.trim() && !/^https?:\/\//i.test(root)) {
    root = resolveJenkinsRequestUrl(jenkinsBase, root)
  }
  const u = root.replace(/\/?$/, '') + '/api/json'
  console.log('[JenkinsRunner] fetchBuildJson', { url: u })
  const r = await fetch(u, { headers: { Authorization: basicAuthHeader(user, token) } })
  if (!r.ok) {
    const t = await r.text()
    console.warn('[JenkinsRunner] fetchBuildJson HTTP 非 2xx', { url: u, status: r.status })
    throw new Error(`读取构建信息失败: ${r.status} ${t.slice(0, 200)}`)
  }
  return (await r.json()) as BuildJson
}

export async function pollBuildFinished(
  buildUrl: string,
  user: string,
  token: string,
  opts: { maxWaitMs?: number; intervalMs?: number; jenkinsBase?: string } = {},
): Promise<BuildJson> {
  const { maxWaitMs = 2 * 60 * 60 * 1000, intervalMs = 2000, jenkinsBase } = opts
  const start = Date.now()
  for (;;) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error('等待构建结束超时')
    }
    const b = await fetchBuildJson(buildUrl, user, token, jenkinsBase)
    if (!b.building && b.result) {
      return b
    }
    await sleep(intervalMs)
  }
}

export function buildJobPageUrl(jenkinsBase: string, jobPath: string): string {
  return joinUrl(trimJenkinsBase(jenkinsBase), normalizeJobPath(jobPath) + '/')
}

/** “Build with Parameters” 页面（HTML），用于从页面抓取动态参数选项 */
export function buildWithParamsPageUrl(jenkinsBase: string, jobPath: string): string {
  return joinUrl(trimJenkinsBase(jenkinsBase), normalizeJobPath(jobPath) + '/build?delay=0sec')
}

/** 将 Jenkins 站点内相对路径或绝对 URL 转为可请求的完整 URL */
export function resolveJenkinsRequestUrl(jenkinsBase: string, pathOrUrl: string): string {
  const p = pathOrUrl.trim()
  if (/^https?:\/\//i.test(p)) return p
  return joinUrl(trimJenkinsBase(jenkinsBase), p.replace(/^\//, ''))
}

/**
 * 解析 Jenkins descriptor fillUrl（如 GitParameter fillValueItems）返回的 JSON 中的选项。
 * 兼容 `values` 为 string[] 或 `{ name, value }[]` 等常见 Stapler 形态。
 */
export function parseFillUrlValuesJson(text: string): string[] {
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    return []
  }
  const out: string[] = []
  const pushStr = (s: unknown) => {
    const v = String(s ?? '').trim()
    if (v) out.push(v)
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string') pushStr(item)
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        pushStr(o.value ?? o.name ?? o.Value ?? o.Name)
      }
    }
    return [...new Set(out)]
  }

  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const values = o.values ?? o.Vals
    if (!Array.isArray(values)) return []

    for (const item of values) {
      if (typeof item === 'string') pushStr(item)
      else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>
        pushStr(row.value ?? row.name ?? row.Value ?? row.Name)
      }
    }
  }
  return [...new Set(out)]
}

/** 等价 curl -u user:token fillUrl，取 JSON 中的 values 作为下拉选项 */
export async function fetchJenkinsFillUrlOptions(
  jenkinsBase: string,
  user: string,
  token: string,
  fillUrl: string,
): Promise<string[]> {
  const url = resolveJenkinsRequestUrl(jenkinsBase, fillUrl)
  const r = await fetch(url, { headers: { Authorization: basicAuthHeader(user, token) } })
  const text = await r.text().catch(() => '')
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${(text || '').slice(0, 240)}`)
  }
  const opts = parseFillUrlValuesJson(text)
  if (!opts.length && text.trim().startsWith('<')) {
    throw new Error('返回了 HTML 而非 JSON（可能被重定向到登录页）')
  }
  return opts
}

export async function fetchBuildWithParamsPageHtml(
  jenkinsBase: string,
  user: string,
  token: string,
  jobPath: string,
  overrideUrl?: string
): Promise<string> {
  const base = trimJenkinsBase(jenkinsBase)
  const url = overrideUrl
    ? /^https?:\/\//i.test(overrideUrl.trim())
      ? overrideUrl.trim()
      : joinUrl(base, overrideUrl)
    : buildWithParamsPageUrl(base, jobPath)
  // 注意：用于解析 DOM 的页面抓取不要强依赖 200/ok。
  // Jenkins 可能返回 403/302/错误页，但我们仍然希望拿到 HTML 来解析/诊断。
  const r = await fetch(url, { headers: { Authorization: basicAuthHeader(user, token) } })
  const t = await r.text().catch(() => '')
  if (!t) {
    throw new Error(`读取参数页无内容: ${r.status}`)
  }
  return t
}
