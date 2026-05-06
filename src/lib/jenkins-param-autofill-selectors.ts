/** Jenkins 参数页 HTML 中参数名在 CSS 属性选择器里的转义（双引号包裹） */
export function escapeCssAttrValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * 运行时 / 保存规则用：按优先级尝试多种选择器，覆盖常见 Jenkins 表单结构。
 *
 * 使用 `~`（一般兄弟）而非 `+`（相邻兄弟）：只要与参照 input 同父级、在其后的同级节点链上能找到 select 即可。
 *
 * - `select[name=…]`：直接按表单控件 name 命中。
 * - `input[name=name][value=…] ~ …`：Jenkins 常见隐藏参数名 + 同块内后续任意兄弟上的 select（或兄弟包裹层内的 select）。
 * - `input[value=…] ~ …`：兼容以 value 标识参数的旧 DOM。
 */
export function paramAutoFillSelectorCandidates(paramKey: string, storedSelector: string): string[] {
  const safe = escapeCssAttrValue(paramKey.trim())
  const builtIns = [
    `select[name="${safe}"]`,
    `input[type="hidden"][name="name"][value="${safe}"] ~ select, input[type="hidden"][name="name"][value="${safe}"] ~ * select`,
    `input[value="${safe}"] ~ select, input[value="${safe}"] ~ * select`,
  ]
  const primary = String(storedSelector || '').trim()
  const out: string[] = []
  const seen = new Set<string>()
  if (primary) {
    out.push(primary)
    seen.add(primary)
  }
  for (const b of builtIns) {
    if (!seen.has(b)) {
      seen.add(b)
      out.push(b)
    }
  }
  return out
}

/** 新建 Job 自动取值规则时写入的默认 selector（逗号并集，一次 query 也可命中） */
export function defaultParamAutoFillSelectorString(paramKey: string): string {
  return paramAutoFillSelectorCandidates(paramKey, '').join(', ')
}
