import { ref } from 'vue'
import { runJobAndMaybeChain } from '@/ui/composables/runPipeline'

/** 任意页面触发构建时的全局 UI 状态（运行监控可展示日志） */
export const pipelineUiBusy = ref(false)
export const pipelineUiLog = ref('')
/** 当前流水线已分配到 Jenkins 的构建页 URL（用于「终止」等） */
export const pipelineUiActiveBuildUrl = ref<string | null>(null)

export async function runJobFromUi(jobId: string): Promise<void> {
  pipelineUiLog.value = ''
  pipelineUiActiveBuildUrl.value = null
  pipelineUiBusy.value = true
  try {
    await runJobAndMaybeChain(jobId, {
      onLog: (l) => {
        pipelineUiLog.value = (pipelineUiLog.value + l + '\n').slice(-8000)
      },
      onBuildAllocated: ({ buildUrl }) => {
        pipelineUiActiveBuildUrl.value = buildUrl
      },
    })
  } catch (e) {
    pipelineUiLog.value += `\n[错误] ${(e as Error).message}\n`
  } finally {
    pipelineUiActiveBuildUrl.value = null
    pipelineUiBusy.value = false
  }
}
