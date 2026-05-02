import type { JobParamInputType } from '@/types'

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
}

function optionValues(sel: HTMLSelectElement): string[] {
  return Array.from(sel.options)
    .map((o) => String(o.value ?? '').trim())
    .filter(Boolean)
}

function parseFormItem(item: Element): ParsedBuildFormParam | null {
  const label = item.querySelector('.jenkins-form-label')?.textContent?.trim() || ''
  const hiddenName = item.querySelector('input[type="hidden"][name="name"]') as HTMLInputElement | null
  const keyFromHidden = hiddenName?.value?.trim() || ''

  const valueInputs = Array.from(item.querySelectorAll('input[name="value"]')).filter(
    (n): n is HTMLInputElement => n instanceof HTMLInputElement,
  )
  const textValueInput = valueInputs.find((inp) => {
    const t = (inp.type || 'text').toLowerCase()
    return t === 'text' || t === 'search' || t === 'url' || t === 'password' || t === ''
  })
  if (textValueInput) {
    const key = keyFromHidden || label || 'param'
    return {
      key,
      label: label || key,
      type: 'text',
      value: String(textValueInput.value ?? ''),
      options: [],
    }
  }

  const selectValue = item.querySelector('select[name="value"]') as HTMLSelectElement | null
  if (selectValue) {
    const opts = optionValues(selectValue)
    const fillRaw = selectValue.getAttribute('fillurl') || selectValue.getAttribute('fillUrl')
    const fillUrl = fillRaw?.trim() || undefined
    const isDynamic =
      !!fillUrl ||
      selectValue.classList.contains('gitParameterSelect') ||
      selectValue.id === 'gitParameterSelect'
    const key = keyFromHidden || label || 'param'
    return {
      key,
      label: label || key,
      type: isDynamic ? 'dynamic' : 'choice',
      value: opts[0] ?? '',
      options: opts,
      fillUrl,
    }
  }

  const firstSelect = item.querySelector('select') as HTMLSelectElement | null
  if (firstSelect) {
    const opts = optionValues(firstSelect)
    const nameAttr = firstSelect.getAttribute('name')?.trim() || ''
    const key = nameAttr || keyFromHidden || label || 'param'
    return {
      key,
      label: label || keyFromHidden || key,
      type: 'choice',
      value: opts[0] ?? '',
      options: opts,
    }
  }

  return null
}

/**
 * 解析 Jenkins「Build with Parameters」页（/job/.../build?delay=0sec）的 HTML。
 * 参考：form.jenkins-form 下 .jenkins-form-item 与 .jenkins-form-label。
 */
export function parseJenkinsBuildParameterFormHtml(html: string): ParsedBuildFormParam[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const form = doc.querySelector('form.jenkins-form')
  if (!form) return []

  let items = form.querySelectorAll('.parameters > .jenkins-form-item')
  if (!items.length) {
    items = form.querySelectorAll(':scope > .jenkins-form-item')
  }
  const out: ParsedBuildFormParam[] = []
  for (const item of items) {
    const parsed = parseFormItem(item)
    if (parsed) out.push(parsed)
  }
  return out
}
