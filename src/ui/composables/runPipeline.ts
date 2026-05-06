import {
  pollBuildFinished,
  pollQueueItem,
  triggerParameterizedBuild,
  buildJobPageUrl,
  fetchBuildWithParamsPageHtml,
  fetchJenkinsFillUrlOptions,
} from '@/lib/jenkins'
import {
  joinCompositeParamValue,
  parseJenkinsBuildParameterFormHtml,
  type ParsedBuildFormParam,
} from '@/lib/jenkins-build-form-parse'
import { paramAutoFillSelectorCandidates } from '@/lib/jenkins-param-autofill-selectors'
import { appendRun, loadJobs, loadSettings, saveJobs, updateRun } from '@/lib/storage'
import { sendWecomMarkdown } from '@/lib/wecom'
import type { BuildResult, JobConfig, JenkinsSettings, JobParamAutoFillRule, RunRecord } from '@/types'

export type RunLogHandler = (line: string) => void

/** Jenkins WorkflowRun.result 大小写不一，统一后再判断 SUCCESS / 链式触发 */
function normalizedJenkinsBuildResult(raw: string | null | undefined): BuildResult {
  if (raw == null || String(raw).trim() === '') return null
  const u = String(raw).trim().toUpperCase()
  if (u === 'SUCCESS' || u === 'FAILURE' || u === 'ABORTED' || u === 'UNSTABLE') return u
  return null
}

export type BuildAllocatedHandler = (info: { buildUrl: string; buildNumber: number | null }) => void

/**
 * 按参数页解析结果打「解析策略」日志；fillUrl 结果写入 cache 供后续自动取值复用。
 */
async function logParsedBuildFormStrategies(
  settings: JenkinsSettings,
  parsed: ParsedBuildFormParam[],
  fillUrlOptionCache: Map<string, string[]>,
  log?: (s: string) => void,
): Promise<void> {
  const loadFillOpts = async (fillUrl: string): Promise<string[]> => {
    const u = fillUrl.trim()
    if (fillUrlOptionCache.has(u)) return fillUrlOptionCache.get(u)!
    const opts = await fetchJenkinsFillUrlOptions(
      settings.jenkinsUrl,
      settings.jenkinsUser,
      settings.jenkinsToken,
      u,
    )
    fillUrlOptionCache.set(u, opts)
    return opts
  }

  for (const p of parsed) {
    log?.(`解析参数 [${p.key}]`)

    if (p.type === 'text') {
      const v = String(p.value ?? '').trim() || '（空）'
      log?.(`解析策略：默认预填 [${v}]`)
      continue
    }

    const fillUrl = p.fillUrl?.trim()
    const asInterfaceLoad = p.type === 'dynamic' || !!fillUrl

    if (asInterfaceLoad) {
      if (fillUrl) {
        try {
          const opts = await loadFillOpts(fillUrl)
          const rawFirst = opts.length ? String(opts[0]).trim() : '（无）'
          const first =
            rawFirst !== '（无）'
              ? joinCompositeParamValue(rawFirst, p.compositePrefix, p.compositeSuffix)
              : rawFirst
          log?.(`解析策略：接口加载 [${first}]`)
        } catch {
          const snap = String(p.options[0] ?? p.value ?? '').trim() || '（无）'
          log?.(`解析策略：接口加载 [${snap}]（接口失败，参数页快照）`)
        }
      } else {
        const snap = String(p.options[0] ?? p.value ?? '').trim() || '（无）'
        log?.(`解析策略：接口加载 [${snap}]（参数页内选项）`)
      }
      continue
    }

    const first = String(p.options[0] ?? p.value ?? '').trim() || '（无）'
    log?.(`解析策略：下拉框第一条 [${first}]`)
  }
}

function webhookForJob(settings: JenkinsSettings): string {
  return (settings.wecomWebhookGlobal || '').trim()
}

export async function runJobAndMaybeChain(
  startJobId: string,
  opts: { onLog?: RunLogHandler; chainDepth?: number; onBuildAllocated?: BuildAllocatedHandler } = {},
): Promise<void> {
  const { onLog, chainDepth = 0, onBuildAllocated } = opts
  const log = (s: string) => onLog?.(s)

  const settings = await loadSettings()
  if (!settings.jenkinsUrl || !settings.jenkinsUser || !settings.jenkinsToken) {
    throw new Error('请先在「基础配置」中填写 Jenkins 地址、用户与 API Token')
  }

  const jobs = await loadJobs()
  const job = jobs.find((j) => j.id === startJobId)
  if (!job) throw new Error('未找到该 Job 配置')

  // 默认使用「上次成功」参数；若没有，则回退到当前配置参数
  const params = { ...(job.lastSuccessParams || job.displayParams || {}) }
  if (Object.keys(params).length === 0) {
    log?.('提示: 未配置任何参数。若 Jenkins 该任务需要参数，构建可能失败。')
  }

  // 参数自动取值：从 Jenkins 参数页抓取动态下拉的最新 option
  try {
    await applyParamAutoFill(settings, job, params, log)
  } catch (e) {
    log?.(`参数自动取值失败（将继续使用原值）: ${(e as Error).message}`)
  }

  const runId = crypto.randomUUID()
  const rec: RunRecord = {
    id: runId,
    jobId: job.id,
    jobName: job.name,
    startTime: Date.now(),
    endTime: null,
    buildNumber: null,
    result: null,
    error: null,
    buildUrl: null,
    queueItemApiUrl: null,
  }
  await appendRun(rec)
  log?.(`[${chainDepth > 0 ? '链式' : '开始'}] ${job.name} 触发中…`)

  const wh = webhookForJob(settings)
  if (wh) {
    try {
      const jobType = chainDepth > 0 ? '关联任务' : '主任务'
      await sendWecomMarkdown(
        wh,
        `**Jenkins 开始构建**\n> 任务: ${job.name}\n> 类型: ${jobType}\n> 参数: \`${JSON.stringify(params)}\``,
      )
    } catch (e) {
      log?.(`企微(开始) 通知失败: ${(e as Error).message}`)
    }
  }

  let result: BuildResult = null
  let errMsg: string | null = null
  let finalBuildUrl: string | null = null
  let finalBuildNumber: number | null = null

  try {
    const queueUrl = await triggerParameterizedBuild(
      settings.jenkinsUrl,
      settings.jenkinsUser,
      settings.jenkinsToken,
      job.jobPath,
      params,
    )
    await updateRun(runId, { queueItemApiUrl: queueUrl })
    log?.('已入队，等待分配构建号…')
    const q = await pollQueueItem(queueUrl, settings.jenkinsUser, settings.jenkinsToken)
    finalBuildUrl = q.buildUrl
    finalBuildNumber = q.buildNumber
    await updateRun(runId, {
      buildUrl: finalBuildUrl,
      buildNumber: finalBuildNumber,
      queueItemApiUrl: null,
    })
    if (finalBuildUrl) onBuildAllocated?.({ buildUrl: finalBuildUrl, buildNumber: finalBuildNumber })
    log?.(`已分配 #${finalBuildNumber}，等待结束…`)
    const b = await pollBuildFinished(q.buildUrl, settings.jenkinsUser, settings.jenkinsToken, {
      jenkinsBase: settings.jenkinsUrl,
    })
    result = normalizedJenkinsBuildResult(b.result)
    if (result === 'SUCCESS') {
      const list = await loadJobs()
      const idx = list.findIndex((j) => j.id === job.id)
      if (idx >= 0) {
        list[idx] = { ...list[idx], lastSuccessParams: { ...params } }
        await saveJobs(list)
      }
    } else {
      errMsg = `Jenkins 结果: ${result ?? '未知'}`
    }
  } catch (e) {
    errMsg = (e as Error).message
    result = 'FAILURE'
    log?.(errMsg)
  } finally {
    const endPatch: Partial<
      Pick<RunRecord, 'endTime' | 'result' | 'error' | 'buildUrl' | 'buildNumber'>
    > = {
      endTime: Date.now(),
      result,
      error: errMsg,
    }
    if (finalBuildUrl != null && String(finalBuildUrl).trim() !== '') {
      endPatch.buildUrl = finalBuildUrl
      if (finalBuildNumber != null) endPatch.buildNumber = finalBuildNumber
    }
    await updateRun(runId, endPatch)
  }

  if (!errMsg && result === 'SUCCESS' && job.verifyUrl?.trim()) {
    log?.('构建成功，正在打开验证地址…')
    openUrlInNewTab(job.verifyUrl.trim())
  }

  const wh2 = webhookForJob(settings)
  if (wh2) {
    const jobPage = buildJobPageUrl(settings.jenkinsUrl, job.jobPath)
    const buildLink =
      finalBuildUrl && finalBuildNumber != null
        ? `构建 [#${finalBuildNumber}](${String(finalBuildUrl).replace(/\/$/, '')})`
        : `任务: [${job.name}](${jobPage})`
    try {
      if (errMsg) {
        await sendWecomMarkdown(wh2, `**Jenkins 失败** ${job.name}\n> ${errMsg}\n> ${buildLink}`)
      } else {
        await sendWecomMarkdown(
          wh2,
          `**Jenkins 完成** ${job.name}\n> 结果: \`${String(result)}\`\n> ${buildLink}`,
        )
      }
    } catch (e) {
      log?.(`企微(结束) 通知失败: ${(e as Error).message}`)
    }
  }

  if (!errMsg && result === 'SUCCESS') {
    const all = await loadJobs()
    const jobLatest = all.find((j) => j.id === job.id) ?? job
    const nextId =
      typeof jobLatest.nextJobId === 'string' && jobLatest.nextJobId.trim() ? jobLatest.nextJobId.trim() : ''
    if (nextId) {
      const next = all.find((j) => j.id === nextId)
      if (next) {
        log?.(`成功，链式触发: ${next.name}`)
        log?.('等待 3 秒后继续…')
        await new Promise<void>((resolve) => setTimeout(resolve, 3000))
        await runJobAndMaybeChain(next.id, { onLog, chainDepth: chainDepth + 1, onBuildAllocated })
      } else {
        log?.(`未找到关联 Job（nextJobId=${nextId}），请确认 Jobs 列表中仍存在该任务并已保存。`)
      }
    }
  }
}

async function applyParamAutoFill(
  settings: JenkinsSettings,
  job: JobConfig,
  params: Record<string, string>,
  log?: (s: string) => void
): Promise<void> {
  const rules = job.paramAutoFill ?? {}
  const entries = Object.entries(rules).filter(([, r]) => r && String(r.selector || '').trim())
  if (!entries.length) return

  // 先拉默认 build?delay=0sec，与 Jobs 详情「从 Jenkins 同步」同一套解析；日志列出全部表单项
  const defaultHtml = await fetchBuildWithParamsPageHtml(
    settings.jenkinsUrl,
    settings.jenkinsUser,
    settings.jenkinsToken,
    job.jobPath,
  )
  const parsedForm = parseJenkinsBuildParameterFormHtml(defaultHtml)
  const fillUrlOptionCache = new Map<string, string[]>()
  if (parsedForm.length) {
    await logParsedBuildFormStrategies(settings, parsedForm, fillUrlOptionCache, log)
  } else {
    log?.('解析参数：（delay=0sec 参数页未解析到任何表单项）')
  }

  // 自动取值：无 pageUrl 时复用上列 HTML；有 pageUrl 则单独请求
  const getHtml = async (rule: JobParamAutoFillRule) => {
    if (rule.pageUrl?.trim()) {
      return await fetchBuildWithParamsPageHtml(
        settings.jenkinsUrl,
        settings.jenkinsUser,
        settings.jenkinsToken,
        job.jobPath,
        rule.pageUrl,
      )
    }
    return defaultHtml
  }

  const parsedByKey = new Map(parsedForm.map((p) => [p.key.trim(), p]))

  for (const [paramKey, rule] of entries) {
    const meta = parsedByKey.get(paramKey.trim())
    const fillUrl = meta?.fillUrl?.trim()
    // 与「解析策略：接口加载」一致：有 fillUrl 时与 Job 详情同步逻辑相同，走 descriptor JSON，不依赖易过期的 CSS
    if (fillUrl) {
      try {
        let opts = fillUrlOptionCache.get(fillUrl)
        if (!opts) {
          opts = await fetchJenkinsFillUrlOptions(
            settings.jenkinsUrl,
            settings.jenkinsUser,
            settings.jenkinsToken,
            fillUrl,
          )
          fillUrlOptionCache.set(fillUrl, opts)
        }
        if (opts.length) {
          const pick = rule.pick ?? 'first'
          let finalVal = String(pick === 'last' ? opts[opts.length - 1]! : opts[0]!).trim()
          if (rule.regex) {
            const re = new RegExp(rule.regex)
            const m = finalVal.match(re)
            if (!m) throw new Error(`正则未匹配: ${paramKey} regex=${rule.regex}`)
            const g = rule.regexGroup ?? 1
            finalVal = (m[g] ?? m[0] ?? '').trim()
            if (!finalVal) throw new Error(`正则提取为空: ${paramKey} regex=${rule.regex} group=${g}`)
          }
          finalVal = joinCompositeParamValue(finalVal, meta?.compositePrefix, meta?.compositeSuffix)
          params[paramKey] = finalVal
          continue
        }
        log?.(`参数自动取值: ${paramKey} fillUrl 返回空列表，回退 DOM 选择器…`)
      } catch (e) {
        log?.(`参数自动取值: ${paramKey} fillUrl 请求失败，回退 DOM：${(e as Error).message}`)
      }
    }

    const html = await getHtml(rule)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const candidates = paramAutoFillSelectorCandidates(paramKey, rule.selector)
    let nodes: Element[] = []
    let matchedSelector = ''
    for (let i = 0; i < candidates.length; i++) {
      const sel = candidates[i]!
      nodes = Array.from(doc.querySelectorAll(sel))
      if (nodes.length) {
        matchedSelector = sel
        break
      }
    }
    if (!nodes.length) {
      throw new Error(`selector 未匹配到元素: ${paramKey} -> 已尝试: ${candidates.join(' | ')}`)
    }

    const pick = rule.pick ?? 'first'
    const picked = pick === 'last' ? nodes[nodes.length - 1] : nodes[0]

    // selector 既可以指向 select，也可以指向 option/其它元素
    let raw = ''
    if (picked instanceof HTMLOptionElement) {
      raw = (rule.from ?? 'value') === 'text' ? picked.textContent || '' : picked.value || ''
    } else if (picked instanceof HTMLSelectElement) {
      const opt = picked.options?.item(pick === 'last' ? picked.options.length - 1 : 0)
      if (!opt) throw new Error(`select 内无 option: ${paramKey} -> ${matchedSelector}`)
      raw = (rule.from ?? 'value') === 'text' ? opt.textContent || '' : opt.value || ''
    } else {
      // 兜底：普通元素取 text / attribute(value)
      raw =
        (rule.from ?? 'value') === 'text'
          ? (picked.textContent || '')
          : (picked.getAttribute('value') || (picked as any).value || '')
    }

    const rawTrim = String(raw).trim()
    if (!rawTrim) {
      throw new Error(`取到空值: ${paramKey} -> ${matchedSelector}`)
    }

    let finalVal = rawTrim
    if (rule.regex) {
      const re = new RegExp(rule.regex)
      const m = finalVal.match(re)
      if (!m) throw new Error(`正则未匹配: ${paramKey} regex=${rule.regex}`)
      const g = rule.regexGroup ?? 1
      finalVal = (m[g] ?? m[0] ?? '').trim()
      if (!finalVal) throw new Error(`正则提取为空: ${paramKey} regex=${rule.regex} group=${g}`)
    }
    finalVal = joinCompositeParamValue(finalVal, meta?.compositePrefix, meta?.compositeSuffix)

    params[paramKey] = finalVal
  }
}

export function openUrlInNewTab(u: string): void {
  if (!u) return
  void chrome.tabs.create({ url: u })
}
