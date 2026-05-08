import type { JobParamInputType } from '@/types'
import { parseHtmlToDocument } from '@/lib/parse-html-document'

export interface ParsedBuildFormParam {
  /** 提交到 Jenkins 的参数名 */
  key: string
  /** 表单标签展示名 */
  label: string
  type: JobParamInputType
  value: string
  options: string[]
  /** select 上 descriptor 的 fillUrl/fillurl，需用 Basic 请求后取 JSON values */
  fillUrl?: string
  compositePrefix?: string
  compositeSuffix?: string
  /** 无标准 name=value 时：块级首行，value 取末子字段 */
  compositeBlockLeader?: boolean
  /** 子字段：UI 缩进，归属块级 key */
  parentBlockKey?: string
}

export interface ParseJenkinsBuildFormAsyncContext {
  fetchFillUrlOptions: (url: string) => Promise<string[]>
}

export interface ParseJenkinsBuildFormAsyncResult {
  params: ParsedBuildFormParam[]
  /** 与 Jobs 同步页一致：`${key}: ${message}` */
  fillUrlErrors: string[]
}

const META_NAMES = new Set(['name', 'description'])

function optionValues(sel: HTMLSelectElement): string[] {
  return Array.from(sel.options)
    .map((o) => String(o.value ?? '').trim())
    .filter(Boolean)
}

function isGitDynamicSelect(sel: HTMLSelectElement): boolean {
  return sel.classList.contains('gitParameterSelect') || sel.id === 'gitParameterSelect'
}

export function readFillUrl(sel: HTMLSelectElement): string | undefined {
  const fr = sel.getAttribute('fillurl') || sel.getAttribute('fillUrl')
  return fr?.trim() || undefined
}

function isSelectEl(n: Element): n is HTMLSelectElement {
  return n.tagName?.toUpperCase() === 'SELECT'
}

function isInputEl(n: Element): n is HTMLInputElement {
  return n.tagName?.toUpperCase() === 'INPUT'
}

function isSkippableInput(inp: HTMLInputElement): boolean {
  const t = (inp.type || '').toLowerCase()
  return t === 'submit' || t === 'button' || t === 'image' || t === 'reset'
}

/** formItem 下第一个标准 value 控件：input[name=value] 或 select[name=value]（文档序） */
function findStandardValueControl(formItem: Element): HTMLInputElement | HTMLSelectElement | null {
  const nodes = formItem.querySelectorAll('input[name="value"], select[name="value"]')
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    if (isSelectEl(n)) return n
    if (isInputEl(n) && !isSkippableInput(n)) return n
  }
  return null
}

function controlKey(el: HTMLInputElement | HTMLSelectElement): string {
  return (el.name || '').trim()
}

function parseInputToParam(
  inp: HTMLInputElement,
  fieldKey: string,
  blockLabel: string,
  blockParamKey: string,
): ParsedBuildFormParam {
  const blockDisplay = blockLabel || blockParamKey
  const label = `${blockDisplay} · ${fieldKey}`
  const t = (inp.type || '').toLowerCase()
  if (t === 'checkbox' || t === 'radio') {
    const v = inp.checked ? String(inp.value ?? '').trim() || 'on' : ''
    return { key: fieldKey, label, type: 'text', value: v, options: [] }
  }
  return {
    key: fieldKey,
    label,
    type: 'text',
    value: String(inp.value ?? ''),
    options: [],
  }
}

function selectParamFromOptions(
  sel: HTMLSelectElement,
  key: string,
  label: string,
  options: string[],
): ParsedBuildFormParam {
  const fillUrl = readFillUrl(sel)
  const isDynamic = !!fillUrl || isGitDynamicSelect(sel)
  const opts = options.length ? options : optionValues(sel)
  return {
    key,
    label,
    type: isDynamic ? 'dynamic' : 'choice',
    value: opts[0] ?? '',
    options: opts,
    fillUrl: fillUrl || undefined,
  }
}

/** 无标准 name=value：首行块名（value=末子字段）+ 子行带 parentBlockKey */
function expandBlockWithoutStandardValue(
  paramKey: string,
  blockLabel: string,
  multiResults: ParsedBuildFormParam[],
): ParsedBuildFormParam[] {
  if (multiResults.length === 0) return []
  const last = multiResults[multiResults.length - 1]!
  const leader: ParsedBuildFormParam = {
    key: paramKey,
    label: blockLabel || paramKey,
    type: 'text',
    value: last.value,
    options: [],
    compositeBlockLeader: true,
  }
  const withParent = multiResults.map((p) => ({
    ...p,
    parentBlockKey: paramKey,
  }))
  return [leader, ...withParent]
}

/** 解析标准 value：input 文本/勾选；select 用已有 options */
function standardValueToParam(
  el: HTMLInputElement | HTMLSelectElement,
  paramKey: string,
  blockLabel: string,
): ParsedBuildFormParam {
  const label = blockLabel || paramKey
  if (isSelectEl(el)) {
    return selectParamFromOptions(el, paramKey, label, optionValues(el))
  }
  const inp = el
  const t = (inp.type || '').toLowerCase()
  if (t === 'checkbox' || t === 'radio') {
    const v = inp.checked ? String(inp.value ?? '').trim() || 'on' : ''
    return { key: paramKey, label, type: 'text', value: v, options: [] }
  }
  return {
    key: paramKey,
    label,
    type: 'text',
    value: String(inp.value ?? ''),
    options: [],
  }
}

async function resolveSelectOptionsWithNetwork(
  sel: HTMLSelectElement,
  keyForError: string,
  ctx: {
    fetchFillUrlOptions: (url: string) => Promise<string[]>
    fillUrlCache: Map<string, Promise<string[]>>
    fillUrlErrors: string[]
  },
): Promise<string[]> {
  const fillUrl = readFillUrl(sel)
  if (!fillUrl) return optionValues(sel)
  const u = fillUrl.trim()
  if (!ctx.fillUrlCache.has(u)) {
    ctx.fillUrlCache.set(u, ctx.fetchFillUrlOptions(u))
  }
  try {
    const opts = await ctx.fillUrlCache.get(u)!
    return opts.length ? opts : optionValues(sel)
  } catch (e) {
    ctx.fillUrlErrors.push(`${keyForError}: ${(e as Error).message}`)
    return optionValues(sel)
  }
}

async function standardValueToParamAsync(
  el: HTMLInputElement | HTMLSelectElement,
  paramKey: string,
  blockLabel: string,
  ctx: {
    fetchFillUrlOptions: (url: string) => Promise<string[]>
    fillUrlCache: Map<string, Promise<string[]>>
    fillUrlErrors: string[]
  },
): Promise<ParsedBuildFormParam> {
  const label = blockLabel || paramKey
  if (isSelectEl(el)) {
    const options = await resolveSelectOptionsWithNetwork(el, paramKey, ctx)
    return selectParamFromOptions(el, paramKey, label, options)
  }
  return standardValueToParam(el, paramKey, blockLabel)
}

async function multiControlToParamAsync(
  el: HTMLInputElement | HTMLSelectElement,
  labelText: string,
  blockParamKey: string,
  ctx: {
    fetchFillUrlOptions: (url: string) => Promise<string[]>
    fillUrlCache: Map<string, Promise<string[]>>
    fillUrlErrors: string[]
  },
): Promise<ParsedBuildFormParam | null> {
  const fieldKey = controlKey(el)
  if (!fieldKey || META_NAMES.has(fieldKey)) return null

  if (isSelectEl(el)) {
    const options = await resolveSelectOptionsWithNetwork(el, fieldKey, ctx)
    const blockDisplay = labelText || blockParamKey
    const label = `${blockDisplay} · ${fieldKey}`
    return selectParamFromOptions(el, fieldKey, label, options)
  }

  const inp = el
  if (isSkippableInput(inp)) return null
  return parseInputToParam(inp, fieldKey, labelText, blockParamKey)
}

function multiControlToParamSync(
  el: HTMLInputElement | HTMLSelectElement,
  labelText: string,
  blockParamKey: string,
): ParsedBuildFormParam | null {
  const fieldKey = controlKey(el)
  if (!fieldKey || META_NAMES.has(fieldKey)) return null

  if (isSelectEl(el)) {
    const blockDisplay = labelText || blockParamKey
    const label = `${blockDisplay} · ${fieldKey}`
    return selectParamFromOptions(el, fieldKey, label, optionValues(el))
  }

  const inp = el
  if (isSkippableInput(inp)) return null
  return parseInputToParam(inp, fieldKey, labelText, blockParamKey)
}

async function parseFormItemAsync(
  formItem: Element,
  ctx: {
    fetchFillUrlOptions: (url: string) => Promise<string[]>
    fillUrlCache: Map<string, Promise<string[]>>
    fillUrlErrors: string[]
  },
): Promise<ParsedBuildFormParam[]> {
  const hiddenName = formItem.querySelector('input[type="hidden"][name="name"]') as HTMLInputElement | null
  if (!hiddenName) return []
  const paramKey = hiddenName.value?.trim()
  if (!paramKey) return []

  const labelText = formItem.querySelector('.jenkins-form-label')?.textContent?.trim() || ''
  const used = new Set<Element>([hiddenName])

  const standardEl = findStandardValueControl(formItem)
  const out: ParsedBuildFormParam[] = []

  if (standardEl) {
    used.add(standardEl)
    out.push(await standardValueToParamAsync(standardEl, paramKey, labelText || paramKey, ctx))
  } else {
    const multiResults: ParsedBuildFormParam[] = []
    const children = formItem.querySelectorAll('input, select')
    for (let i = 0; i < children.length; i++) {
      const node = children[i]!
      if (used.has(node)) continue
      if (!isInputEl(node) && !isSelectEl(node)) continue
      const el = node as HTMLInputElement | HTMLSelectElement
      const p = await multiControlToParamAsync(el, labelText, paramKey, ctx)
      if (p) multiResults.push(p)
    }
    if (multiResults.length > 0) {
      out.push(...expandBlockWithoutStandardValue(paramKey, labelText || paramKey, multiResults))
    }
    return out
  }

  const nodeList = formItem.querySelectorAll('input, select')
  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i]!
    if (used.has(node)) continue
    if (!isInputEl(node) && !isSelectEl(node)) continue

    const el = node as HTMLInputElement | HTMLSelectElement
    const p = await multiControlToParamAsync(el, labelText, paramKey, ctx)
    if (p) out.push(p)
  }

  return out
}

function parseFormItemSync(formItem: Element): ParsedBuildFormParam[] {
  const hiddenName = formItem.querySelector('input[type="hidden"][name="name"]') as HTMLInputElement | null
  if (!hiddenName) return []
  const paramKey = hiddenName.value?.trim()
  if (!paramKey) return []

  const labelText = formItem.querySelector('.jenkins-form-label')?.textContent?.trim() || ''
  const used = new Set<Element>([hiddenName])

  const standardEl = findStandardValueControl(formItem)
  const out: ParsedBuildFormParam[] = []

  if (standardEl) {
    used.add(standardEl)
    out.push(standardValueToParam(standardEl, paramKey, labelText || paramKey))
  } else {
    const multiResults: ParsedBuildFormParam[] = []
    const children = formItem.querySelectorAll('input, select')
    for (let i = 0; i < children.length; i++) {
      const node = children[i]!
      if (used.has(node)) continue
      if (!isInputEl(node) && !isSelectEl(node)) continue
      const el = node as HTMLInputElement | HTMLSelectElement
      const p = multiControlToParamSync(el, labelText, paramKey)
      if (p) multiResults.push(p)
    }
    if (multiResults.length > 0) {
      out.push(...expandBlockWithoutStandardValue(paramKey, labelText || paramKey, multiResults))
    }
    return out
  }

  const nodeList = formItem.querySelectorAll('input, select')
  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i]!
    if (used.has(node)) continue
    if (!isInputEl(node) && !isSelectEl(node)) continue

    const el = node as HTMLInputElement | HTMLSelectElement
    const p = multiControlToParamSync(el, labelText, paramKey)
    if (p) out.push(p)
  }

  return out
}

/** 将接口/选项中的一段与前后缀拼成最终参数值（与 runPipeline / Jobs 共用规则） */
export function joinCompositeParamValue(
  middle: string,
  compositePrefix?: string,
  compositeSuffix?: string,
): string {
  const pre = compositePrefix?.trim()
  const suf = compositeSuffix?.trim()
  let out = String(middle ?? '').trim()
  if (pre) out = `${pre}:${out}`
  if (suf) out = `${out}:${suf}`
  return out
}

/**
 * 仅 DOM：带 fillUrl 的 select 只用当前 HTML 内 option，不请求接口。
 * 适合无凭证场景或与 async 解析逻辑对齐前的快照。
 */
export function parseJenkinsBuildParameterFormHtml(html: string): ParsedBuildFormParam[] {
  const doc = parseHtmlToDocument(html)
  const formRoot = doc.querySelector('form.jenkins-form')
  if (!formRoot) return []

  const items = formRoot.querySelectorAll('.jenkins-form-item')
  const out: ParsedBuildFormParam[] = []
  for (const item of items) {
    out.push(...parseFormItemSync(item))
  }
  return out
}

/**
 * 解析 Jenkins「Build with Parameters」页 HTML；选择字段中带 fillUrl 的会通过 ctx 拉全量 options（URL 去重）。
 */
export async function parseJenkinsBuildParameterFormAsync(
  html: string,
  ctx: ParseJenkinsBuildFormAsyncContext,
): Promise<ParseJenkinsBuildFormAsyncResult> {
  const doc = parseHtmlToDocument(html)
  const formRoot = doc.querySelector('form.jenkins-form')
  if (!formRoot) {
    return { params: [], fillUrlErrors: [] }
  }

  const fillUrlCache = new Map<string, Promise<string[]>>()
  const fillUrlErrors: string[] = []
  const innerCtx = {
    fetchFillUrlOptions: ctx.fetchFillUrlOptions,
    fillUrlCache,
    fillUrlErrors,
  }

  const items = formRoot.querySelectorAll('.jenkins-form-item')
  const params: ParsedBuildFormParam[] = []
  for (const item of items) {
    params.push(...(await parseFormItemAsync(item, innerCtx)))
  }
  return { params, fillUrlErrors }
}
