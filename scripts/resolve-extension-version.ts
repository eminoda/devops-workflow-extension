import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function clampSegment(n: number): string {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0
  return String(Math.min(65535, Math.max(0, x)))
}

/**
 * Chrome MV3 manifest `version`：1～4 段整数。
 * 带 semver 预发布（如 1.0.0-alpha.4）时只取核心三元组 1.0.0，不再加第四段。
 */
export function toChromeManifestVersion(raw: string): string {
  const s = String(raw || '')
    .trim()
    .replace(/^v/i, '')
  if (!s) return '0.0.0'

  const noMeta = s.replace(/-\d+-g[0-9a-f]+$/i, '').trim()
  const dash = noMeta.indexOf('-')
  const isPrerelease = dash > 0
  const coreStr = (isPrerelease ? noMeta.slice(0, dash) : noMeta).trim()
  const seg = coreStr
    .split('.')
    .map((p) => parseInt(p, 10))
    .filter((n) => !Number.isNaN(n))
  while (seg.length < 3) seg.push(0)
  const [a, b, c] = seg.slice(0, 3).map((n) => clampSegment(n))

  if (isPrerelease) return `${a}.${b}.${c}`

  if (seg.length >= 4) return `${a}.${b}.${c}.${clampSegment(seg[3])}`
  return `${a}.${b}.${c}`
}

export type ExtensionVersionMeta = {
  /** `manifest.version`：Chrome 仅允许整数段，用于商店/浏览器比较版本先后 */
  version: string
  /** `manifest.version_name`：可写 semver，在扩展管理页等位置展示 */
  versionName: string
}

function readPackageVersionMeta(): ExtensionVersionMeta {
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as {
      version?: string
    }
    const raw = String(pkg.version ?? '0.0.0').trim()
    const versionName = raw.replace(/^v/i, '')
    return {
      version: toChromeManifestVersion(raw),
      versionName: versionName || '0.0.0',
    }
  } catch {
    return { version: '0.0.0', versionName: '0.0.0' }
  }
}

/**
 * 打包时：优先当前 HEAD 的 `git describe`（tag，可带 -N-ghash）；失败则用 package.json。
 * `version` 预发布 tag 只保留核心三元组；完整 semver 写在 `version_name`。
 */
export function resolveExtensionVersionMeta(): ExtensionVersionMeta {
  try {
    const describe = execSync('git describe --tags --always --match=v*', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (!describe) return readPackageVersionMeta()
    const tagPart = describe.replace(/-\d+-g[0-9a-f]+$/i, '').trim()
    const versionName = tagPart.replace(/^v/i, '') || '0.0.0'
    return {
      version: toChromeManifestVersion(tagPart),
      versionName,
    }
  } catch {
    return readPackageVersionMeta()
  }
}
