export interface JenkinsSettings {
  jenkinsUrl: string
  jenkinsUser: string
  jenkinsToken: string
  wecomWebhookGlobal: string
}

export interface JobConfig {
  id: string
  /** 列表展示用别名，留空则显示「新 Job」 */
  name: string
  /** Jenkins Job 名称：与 URL 中 /job/ 之后的路径段一致，如 T-E-xxx 或 job/A/job/B */
  jobPath: string
  /** 参数化构建的键值：与 Jenkins 表单提交字段名一致（含拆块后的子字段名） */
  displayParams: Record<string, string>
  /** 参数类型配置：输入框 / 下拉框 / 动态参数 */
  paramConfig?: Record<string, JobParamConfig>
  /**
   * 参数自动取值（从 Jenkins “Build with Parameters” 页面抓取）
   * key 与解析出的表单字段一致：标准模板下为块级参数名（如 REGION），
   * 拆块时为子控件 name（如 imageName、imageTag）
   */
  paramAutoFill?: Record<string, JobParamAutoFillRule>
  /** 成功后自动触发的下一个 Job id，无则 null */
  nextJobId: string | null
  lastSuccessParams: Record<string, string> | null
  /** 构建成功后自动在浏览器打开；也可在列表中手动打开 */
  verifyUrl: string
}

export type JobParamInputType = 'text' | 'choice' | 'dynamic'

export interface JobParamConfig {
  type: JobParamInputType
  /**
   * 仅对 dynamic 生效：执行时是否重新拉取最新 option（默认 true）
   * - true: 运行 job 时会再次加载参数页取最新值
   * - false: 运行时不再刷新，直接使用已保存的 displayParams
   */
  dynamicLatest?: boolean
  /**
   * 仅对 choice 生效：执行时是否从 Jenkins 参数页重新抓取该下拉的首项（默认 false）
   */
  choiceLatest?: boolean
}

export interface JobParamAutoFillRule {
  /** CSS selector：可指向 select 或 option 或其它元素（见 from） */
  selector: string
  /** 从匹配元素取值：value(默认) / text */
  from?: 'value' | 'text'
  /** 多个匹配时取哪一个：first(默认) / last */
  pick?: 'first' | 'last'
  /** 可选：对取到的字符串做正则提取（取 group） */
  regex?: string
  /** regex 捕获组序号，默认 1（若无捕获组则回退整个匹配） */
  regexGroup?: number
  /**
   * 默认会访问 `${jobPath}/build?delay=0sec`（Build with Parameters 页面）
   * 若你填了该字段，则会覆盖访问 URL（绝对或相对 jenkinsUrl）
   */
  pageUrl?: string
}

export type BuildResult = 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null

export interface RunRecord {
  id: string
  jobId: string
  jobName: string
  startTime: number
  endTime: number | null
  buildNumber: number | null
  result: BuildResult
  error: string | null
  /** Jenkins 构建页，用于打开标签与 api/json 轮询 */
  buildUrl: string | null
  /**
   * 触发构建后 Jenkins 返回的队列项 `.../queue/item/xxx/api/json`，入队后、分配到构建号前即写入。
   * 用于扩展关闭后仍可通过队列 API 补全 buildUrl。
   */
  queueItemApiUrl?: string | null
}

export const defaultSettings = (): JenkinsSettings => ({
  jenkinsUrl: '',
  jenkinsUser: '',
  jenkinsToken: '',
  wecomWebhookGlobal: '',
})
