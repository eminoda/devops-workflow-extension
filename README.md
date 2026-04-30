# devops-workflow

开发侧轻量「Jenkins 编排 + 状态跟进」的浏览器扩展（本仓库），用于替代反复登录 Jenkins、手工蹲守构建与发布结果。

## 目标与非目标

| 目标 | 说明 |
|------|------|
| 轻量 | 不依赖本机常驻服务/桌面客户端，以 Chrome 扩展 + 本地配置为主 |
| 可配置 | Jenkins 基址、用户 API Token、多 Job 及 **参数化构建** 参数（含默认 branch 等） |
| 可触发、可跟状态 | 用户 **主动** 发起构建，轮询 Jenkins API 直到结束，并提示或跳转 |
| 可串任务 | 支持为「项目 / Job 配置」设置「完成后关联执行的下一个 Job」及参数 |

| 非目标（当前接受） | 说明 |
|-------------------|------|
| Git 提交后自动跑流水线 | 扩展内 **无法** 可靠感知本机 `git push`；若需 **提交即触发**，应使用 **GitLab CI** 等由远端触发（可与本工具并行，见下文） |

## 痛点（背景）

- 需人工登录 Jenkins，在界面中选择分支、发布方式等参数并触发构建/发布。  
- 需长时间在 Jenkins 前等待，再切换业务站验证。  
- 希望减少无效操作，并在流程结束后有明确反馈（如企微）；本工具优先解决 **人主动触发** 与 **跟状态、串任务、快捷打开** 的闭环。

## 总体设计思路

1. **数据层**：在扩展内持久化 Jenkins 连接信息、Job 列表、每 Job 的参数键值、可选的「链式」下一个 Job 与参数。  
2. **交互层**：Vite + Vue3 + TypeScript 搭建 UI；当前 **v0.1** 使用 **UnoCSS** 实现布局与按钮样式，**shadcn-vue** 作为下一迭代可接入的组件层（定稿技术栈保留）。  
3. **执行层**：在 Service Worker 或约定模块中，通过 `fetch` 调用 Jenkins 远程 API（与命令行 `curl` 等价的 HTTP 请求，**不**在文档中提交真实凭证）：
   - 触发：参数化任务使用 `.../buildWithParameters`，可配合 URL query 或 `application/x-www-form-urlencoded` body。  
   - 轮询：对 `lastBuild` / 指定 `buildNumber` / 队列 `queue item` 的 `api/json` 解析 `building`、`result` 等字段。  
   - 若环境开启 CSRF，需先请求 `crumbIssuer/api/json` 再携带 `Jenkins-Crumb` 等头（实现阶段按你司 Jenkins 实际行为处理）。  
4. **链式与记忆**：某 Job 成功后，若配置了下级 Job，则带参数自动触发；可将「上次成功时使用的参数」作为下次默认。  
5. **浏览器能力**：可 `chrome.tabs.create` 打开 Jenkins 构建页/业务站，减少复制链接成本。

> **安全**：Jenkins Token 仅存扩展存储（`chrome.storage`），**禁止**将 Token 提交到代码库或写死在 README/示例中。

## 技术栈（定稿）

- 包管理 / 工程：**pnpm**、**Vite**、**Vue 3**、**TypeScript**  
- UI：当前 **UnoCSS** + Vue SFC；**shadcn-vue**（+ UnoCSS / Tailwind）可在后续版本接入。  
- 扩展：Chrome Manifest V3，pnpm 负责 **构建** 到 `dist/` 后再在 Chrome 中「加载已解压的扩展」。  

## Jenkins 能力约定

### 基础配置

- `JENKINS_URL`：如 `https://jenkins-test.xxx.com`  
- `JENKINS_USER` + **API Token**（用户 Profile 中创建，**勿使用**登录密码当长期凭证）

### Job 与参数

- 初始无 Job，由用户自行添加、填写 **Jenkins Job 名称**（与 Jenkins 地址栏中 `/job/` 后的路径段一致）；**显示名称默认为空**（可选）。编辑后须点击卡片 **「保存」** 才写入 `chrome.storage.local`（删除确认后立即从存储移除）。  
- **默认参数名（可改）**  
  - `branch`：如 `main` / `master` 等。  
- **其他参数**：用户自维护多组 `key` → `value`，与 Jenkins 任务中参数名 **完全一致**（含大小写）。  
- **任务关联**：支持「Job A 成功后自动触发 Job B」，并为 B 配置独立参数。  
- **记忆**：某次执行成功后，可将当次参数写回为默认，便于复用。

### API 形态说明（文档示例，请替换为占位符）

**触发参数化构建**（与命令行 `curl` 同语义，仅示例变量名）：

```bash
curl -X POST -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/job/<JOB_NAME>/buildWithParameters" \
  --data-urlencode "branch=master" \
  --data-urlencode "target=oss"
```

**轮询状态**（示例：最近一次构建）：

```bash
curl -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/job/<JOB_NAME>/lastBuild/api/json"
```

实装时用 **扩展内 fetch** 发同等请求即可。

### 企微（可选模块）

- 在 Job 或全局配置中填写 **企微群机器人 Webhook**（或你司规定的通知 URL）。  
- 构建开始/成功/失败时，用 **与 curl 等价的 `fetch` POST** 发送 JSON 正文（内容格式按企微文档，实现阶段定模板）。  
- 若与 **GitLab CI** 同用，注意避免重复通知（可二选一侧发送）。

## 扩展与 GitLab CI 的关系（可选、并行）

若团队需要 **代码推送即触发 Jenkins** 并 **在 CI 里** 用 curl/脚本发企微，由仓库根目录 `gitlab-ci.yml` 实现即可；**本扩展不替代 CI**，但可与 CI 使用同一套 Jenkins/企微配置思路，供本地人工补跑、串任务、打开页面。

## 版本规划（草稿，后续按迭代裁剪）

| 阶段 | 内容 |
|------|------|
| v0.1 | 扩展脚手架、Jenkins 基础配置、**多 Job** 与参数、触发 + 队列/构建级轮询、**执行历史**、企微、链式、打开 Jenkins/业务站 tab；Crumb 重试 |
| v0.2 | **shadcn-vue** 化组件、可访问性/细节打磨；可选 E2E |
| v0.x | 发版 **zip**、内网分发与注意事项 |

## 本地开发与加载扩展

1. 安装依赖：`pnpm install`  
2. 构建：`pnpm run build`，产物在 **`dist/`** 目录。  
3. 打开 Edge / Chrome，进入 `edge://extensions` 或 `chrome://extensions`，开启「开发人员模式」→ **加载已解压的扩展** → 选择本仓库的 **`dist`** 文件夹。  
4. 点击工具栏扩展图标，会弹出 **Popup 小窗口**（主界面）。如需大页面入口，可在扩展详情页打开「扩展选项」（`options_page`）。发版时只打包 **`dist`** 内文件为 zip（勿包含 `node_modules` 与源码）。

开发时可反复执行 `pnpm run build` 后，在扩展页点「重新加载」；也可自行增加 `package.json` 中的 `build --watch` 类脚本以持续编译。

## 项目结构（简）

| 路径 | 说明 |
|------|------|
| `src/options.html` + `src/ui/*` | 应用入口与页面（Hash 路由：控制台 / Job / 基础配置） |
| `src/background/*` | 工具栏图标 → 新标签页打开主界面 |
| `src/lib/jenkins.ts` | Jenkins 触发、队列/构建轮询、Crumb 重试 |
| `src/lib/storage.ts` | `chrome.storage.local` 与执行历史 |
| `src/lib/wecom.ts` | 企微机器人 Markdown 推送 |
| `src/ui/composables/runPipeline.ts` | 单 Job 运行、链式、企微、记忆成功参数 |
| `manifest.config.ts` | CRX 插件用 manifest 定义 |

## 任务列表（**完成项已勾选**）

- [x] 初始化项目：pnpm + Vite + Vue3 + TS + 扩展入口（MV3）  
- [x] Jenkins 基础配置页（URL、用户、Token 安全说明）  
- [x] Job 管理页：Jenkins Job 名称、显示名称、参数、默认 branch、企微（可选）  
- [x] 执行与状态：触发、轮询、列表/时间线、成功/失败提示  
- [x] 链式执行与「上次成功参数」  
- [x] 完善 README：如何构建、在 Chrome/Edge 中 **加载已解压的扩展**、发版 zip 与注意事项（见上「本地开发与加载扩展」）  
- [ ] 可选：接入 **shadcn-vue** 组件、优化 UI 与无障碍  
- [ ] 可选：E2E / 多浏览器验证  

---

*实现细节以各迭代 Issue 为准。*
