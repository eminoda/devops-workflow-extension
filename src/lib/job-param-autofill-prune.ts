import type { JobParamAutoFillRule } from '@/types'

/** 删除 displayParams 中已不存在的参数的自动取值规则（改 jobPath / 同步参数后避免孤儿键） */
export function pruneParamAutoFillToDisplayParams(
  paramAutoFill: Record<string, JobParamAutoFillRule>,
  displayParams: Record<string, string>,
): void {
  for (const k of Object.keys(paramAutoFill)) {
    if (!Object.prototype.hasOwnProperty.call(displayParams, k)) delete paramAutoFill[k]
  }
}
