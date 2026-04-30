export function trimJenkinsBase(u: string): string {
  return u.trim().replace(/\/+$/, '')
}

/** Jenkins Job 名称（与 /job/ 后路径段一致）：如 T-E-foo 或 job/A/job/B */
export function normalizeJobPath(path: string): string {
  const p = path.trim()
  if (!p) return ''
  return p.startsWith('job/') ? p : `job/${p.replace(/^\/+/, '')}`
}

export function joinUrl(base: string, path: string): string {
  return `${trimJenkinsBase(base)}/${path.replace(/^\//, '')}`
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
