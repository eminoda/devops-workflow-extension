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
  /**
   * fillUrl 对应的那项 `select` 之前各子项（input 取值、其前各 select 的第一条）按文档序用 `:` 拼成。
   * 当前解析策略仅处理「hidden name + 同块控件」，多段组合参数不再由此生成。
   */
  compositePrefix?: string
  /**
   * fillUrl 对应 `select` 之后各子项（input、select 的第一条）按文档序用 `:` 拼成；无则省略。
   */
  compositeSuffix?: string
}

const META_NAMES = new Set(['name', 'description'])

function optionValues(sel: HTMLSelectElement): string[] {
  return Array.from(sel.options)
    .map((o) => String(o.value ?? '').trim())
    .filter(Boolean)
}

function isTextLikeValueInput(inp: HTMLInputElement): boolean {
  const t = (inp.type || '').toLowerCase()
  return t === 'text' || t === 'search' || t === 'url' || t === 'password' || t === ''
}

function isGitDynamicSelect(sel: HTMLSelectElement): boolean {
  return sel.classList.contains('gitParameterSelect') || sel.id === 'gitParameterSelect'
}

function readFillUrl(sel: HTMLSelectElement): string | undefined {
  const fr = sel.getAttribute('fillurl') || sel.getAttribute('fillUrl')
  return fr?.trim() || undefined
}

/**
 * 与 `input[name="name"][type="hidden"]` 同一块内的控件（Jenkins 中通常为相邻兄弟所在容器）。
 */
function parameterControlScope(hiddenNameInput: HTMLInputElement): Element {
  return (
    hiddenNameInput.parentElement ??
    hiddenNameInput.closest('.jenkins-form-item') ??
    hiddenNameInput.ownerDocument.documentElement
  )
}

function isSelectEl(n: Element): n is HTMLSelectElement {
  return n.tagName?.toUpperCase() === 'SELECT'
}

function isInputEl(n: Element): n is HTMLInputElement {
  return n.tagName?.toUpperCase() === 'INPUT'
}

/** 标准模板 1–3 均不满足时：按文档序收集各真实表单项，key 为控件自身的 `name`（不含 DOCKER_IMAGE 等块级 hidden name）。 */
function collectDecomposedControls(scope: Element): Array<HTMLInputElement | HTMLSelectElement> {
  const out: Array<HTMLInputElement | HTMLSelectElement> = []
  for (const node of scope.querySelectorAll('input, select')) {
    if (isSelectEl(node)) {
      const nm = (node.name || '').trim()
      if (!nm || META_NAMES.has(nm)) continue
      out.push(node)
      continue
    }
    if (isInputEl(node)) {
      const nm = (node.name || '').trim()
      if (!nm || META_NAMES.has(nm)) continue
      const t = (node.type || '').toLowerCase()
      if (t === 'submit' || t === 'button' || t === 'image' || t === 'reset') continue
      out.push(node)
    }
  }
  return out
}

function parsedFromNamedControl(
  el: HTMLInputElement | HTMLSelectElement,
  blockLabel: string,
  blockParamKey: string,
): ParsedBuildFormParam {
  const fieldKey = (el.name || '').trim()
  const blockDisplay = blockLabel || blockParamKey
  const label = `${blockDisplay} · ${fieldKey}`

  if (isSelectEl(el)) {
    const opts = optionValues(el)
    const fillUrl = readFillUrl(el)
    const isDynamic = !!fillUrl || isGitDynamicSelect(el)
    return {
      key: fieldKey,
      label,
      type: isDynamic ? 'dynamic' : 'choice',
      value: opts[0] ?? '',
      options: opts,
      fillUrl,
    }
  }

  const inp = el
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

function parseFormItem(item: Element): ParsedBuildFormParam[] {
  const hiddenName = item.querySelector('input[type="hidden"][name="name"]') as HTMLInputElement | null
  if (!hiddenName) return []
  const paramKey = hiddenName.value?.trim()
  if (!paramKey) return []

  const labelText = item.querySelector('.jenkins-form-label')?.textContent?.trim() || ''
  const label = labelText || paramKey
  const scope = parameterControlScope(hiddenName)

  // 1. 标准文本框：input[name="value"] 的 value → 参数 key 为块级 hidden name
  const textValue = Array.from(scope.querySelectorAll('input[name="value"]')).find(
    (n): n is HTMLInputElement => isInputEl(n) && isTextLikeValueInput(n),
  )
  if (textValue) {
    return [
      {
        key: paramKey,
        label,
        type: 'text',
        value: String(textValue.value ?? ''),
        options: [],
      },
    ]
  }

  // 2. 标准单下拉：带 fillUrl 的 select
  const fillSelect = Array.from(scope.querySelectorAll('select')).find((sel) => readFillUrl(sel))
  if (fillSelect) {
    const opts = optionValues(fillSelect)
    const fillUrl = readFillUrl(fillSelect)!
    return [
      {
        key: paramKey,
        label,
        type: 'dynamic',
        value: opts[0] ?? '',
        options: opts.length ? opts : [],
        fillUrl,
      },
    ]
  }

  // 3. 标准单下拉：select[name="value"]
  const selectValue = scope.querySelector('select[name="value"]') as HTMLSelectElement | null
  if (selectValue) {
    const opts = optionValues(selectValue)
    const fillUrl = readFillUrl(selectValue)
    const isDynamic = !!fillUrl || isGitDynamicSelect(selectValue)
    return [
      {
        key: paramKey,
        label,
        type: isDynamic ? 'dynamic' : 'choice',
        value: opts[0] ?? '',
        options: opts,
        fillUrl,
      },
    ]
  }

  // 4. 非标准模板：不产出块级 key（如 DOCKER_IMAGE），按子字段 name 各解析一条（如 imageName、imageTag）
  const fields = collectDecomposedControls(scope)
  if (!fields.length) return []
  return fields.map((el) => parsedFromNamedControl(el, labelText, paramKey))
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
 * 解析 Jenkins「Build with Parameters」页（/job/.../build?delay=0sec）的 HTML。
 * 范围：`form.jenkins-form` 下每个 `.jenkins-form-item`。
 * 块级 key 仅当满足标准模板（value 文本 / fillUrl 下拉 / name=value 下拉）时使用 hidden `name`；
 * 否则拆分为各子控件自身的 `name` 作为 key。
 */
export function parseJenkinsBuildParameterFormHtml(html: string): ParsedBuildFormParam[] {
  const doc = parseHtmlToDocument(html)
  const form = doc.querySelector('form.jenkins-form')
  if (!form) return []

  const items = form.querySelectorAll('.jenkins-form-item')
  const out: ParsedBuildFormParam[] = []
  for (const item of items) {
    out.push(...parseFormItem(item))
  }
  return out
}
