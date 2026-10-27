# Next.js 16 升级记录

核对日期：2026-10-26。基线提交：`8b2368697fe3ed0c8ca2ff28e7f26f5a44add686`（现有 Tauri 2 分支）。升级分支：`chore/next-16-upgrade`。

## 版本与官方依据

| 组件                                         | 升级前实际安装版本 | 升级后 |
| -------------------------------------------- | ------------------ | ------ |
| Next.js                                      | 14.2.35            | 16.4.3 |
| React / React DOM                            | 18.3.1             | 19.3.1 |
| React / React DOM 类型                       | 18.x               | 19.3.0 |
| `@next/third-parties` / `eslint-config-next` | 14.x               | 16.4.3 |
| ESLint                                       | 8.x                | 9.39.5 |
| `@hello-pangea/dnd`                          | 16.5.0             | 18.0.1 |
| `@vercel/analytics`                          | 0.1.11             | 2.0.1  |
| `@vercel/speed-insights`                     | 1.0.2              | 2.0.0  |

Next.js、React 的目标版本通过官方 npm registry 的 `latest` 标签核实，未使用 canary 应用版本。Node.js 24、TypeScript 5.9.3、Yarn 1.22.19 继续使用；React Compiler 和 Cache Components 保持关闭。

迁移依据：

- [Next.js 15 迁移指南](https://nextjs.org/docs/app/guides/upgrading/version-15)：异步请求 API、GET Route Handler 与 fetch 缓存默认行为、移除 `NextRequest.ip`。
- [Next.js 16 迁移指南](https://nextjs.org/docs/app/guides/upgrading/version-16)：Turbopack 默认构建、移除 `next lint`、React 和 TypeScript 配置调整。
- [官方 codemods](https://nextjs.org/docs/app/guides/upgrading/codemods)、[create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app)。
- [Turbopack 配置](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)、[静态导出](https://nextjs.org/docs/app/guides/static-exports)、[pageExtensions](https://nextjs.org/docs/app/api-reference/config/next-config-js/pageExtensions)。
- [版本支持策略](https://nextjs.org/support-policy)、[浏览器要求](https://nextjs.org/docs/app/getting-started/installation#browser-support)。

已在忽略的 `.cache/next16-reference` 中生成 `create-next-app@16.4.3` 的空项目，只对照依赖、TypeScript、ESLint 和默认构建配置。未覆盖业务代码，也未引入模板的 Tailwind、React Compiler 或 Cache Components。

官方 `next-async-request-api` codemod 已对 `app` 执行 dry run，报告 139 个文件未修改。项目将入口导出为 `GET = handle` 等形式，工具未转换这些参数，因此人工修改并通过 Next 生成的路由类型和回归测试验证。框架迁移先通过一次 `next build --webpack`；最终版本已删除 Webpack 自定义配置，仅使用 Turbopack。

开发模式按 Next.js 16.2+ 的官方行为生成过根目录 `AGENTS.md`，指向当前安装版本附带的文档。仓库统一保留中文 Markdown 文档后，已删除该英文文件；后续 `next dev` 检测到 AI 编码代理时仍可能重新生成。未启用实验性 agent feedback。

## 实现与兼容边界

- 三个动态 Route Handler 在入口 `await context.params`，再把普通对象传给原有 provider / 同步处理逻辑。移除静态路由无效的第二参数；IP 日志继续读取 `x-real-ip` / `x-forwarded-for`。HTTP 路径、鉴权、请求/响应结构及流式传输方式延续原行为。未添加全局缓存或静态化规则。
- React 19 改用 `React.JSX`，明确 ref 初值与 DOM ref 的可空类型。两个内部组件改用大写开头的名字，以满足新版 Hooks 检查。拖拽、统计和 React 类型依赖只更新到本次兼容所需版本。
- TypeScript 使用 `moduleResolution: bundler`、`jsx: react-jsx`，包含正式/开发环境生成类型。`yarn typecheck` 先执行 `next typegen`，干净 checkout 无需先构建。
- ESLint 采用 `eslint.config.mjs`，`yarn lint` 独立运行。保留原有 Core Web Vitals 与 Hooks 检查；新增 React Compiler 相关的 effect/ref/purity/memoization 诊断暂设 warning，保留可见性。未为迁移开启编译器或大范围重写状态管理。
- SVG 通过 Turbopack 的 `@svgr/webpack` loader 转换。
- Git 提交时间和哈希只在 `next.config.mjs` 的 Node 环境收集，只向前端注入这两个明确的公开字段。`app/config/build.ts` 不再导入 `child_process`，原公开配置结构不变。源码归档无 Git 时仍使用 `unknown`；Git 的信任设置只作用于本次命令中的仓库路径。
- 删除旧 Babel 配置、`forceSwcTransforms`、单 chunk 插件、`DISABLE_CHUNK` 和直接 Webpack 依赖。浏览器/WebView 基线为 Chrome / Edge / Firefox 111+、Safari 16.4+。四种语言 FAQ 更新为现代浏览器、资源完整性和发布版本一致性的排查说明。
- 普通聊天、模型提供商、设置、备份格式、Tauri 标识及资料目录均未迁移。AI SDK、Zustand、路由和 Markdown 等业务依赖未进行整批更新。

## 移除应用 MCP 功能

按用户要求完整删除项目自己的 MCP 功能：市场页面和导航、聊天工具按钮、初始化与状态查询、工具提示词、回复 JSON 检测、自动工具执行和自动追加对话、Server Actions、stdio 客户端、配置文件、图标、样式及专属测试。移除 `@modelcontextprotocol/sdk` 及其独占依赖，更新锁文件；同时删除 `ENABLE_MCP`、Docker 可写配置目录、桌面替代模块和 Turbopack alias，以及中英韩 README 的启用说明。

不删除用户聊天或修改备份 schema、存储版本。旧记录中的 `isMcpResponse` 额外字段被忽略，正文仍作为普通聊天文本保留；以后模型输出 `json:mcp:...` 代码块只显示文本，不再调用工具或发起下一轮请求。普通系统提示词、输入模板、图片和流式回调保留，由新增的 10 项聊天回归测试覆盖新实例与原有路由两条路径。

此处删除的是应用集成功能。Next.js 自带的开发调试端点属于框架内部实现，本项目没有配置或依赖该端点，也不修改 `node_modules` 中的框架代码。

## 桌面静态导出

Web 和桌面均不再包含 MCP 调用或应用 Server Actions。桌面继续使用完全静态的页面和资源；Web 通过现有 Route Handler 提供模型代理、鉴权与同步。

导出模式设置 `pageExtensions: ["tsx"]`。现有页面和布局都是 `.tsx`，API 入口都是 `route.ts`，因此桌面构建只发现页面，不编译服务端 API。以后新增页面/布局必须遵守此约定；Web 模式仍使用 Next 默认扩展名。桌面仍设置 `images.unoptimized`。

`yarn verify:export` 检查导出配置、公开 meta 中的桌面标识、路由清单、Server Actions 清单、原生子进程导入，以及导出 HTML 引用的所有 `/_next/` 资源是否存在，并确认正常拆分 JavaScript 文件。它读取 Next 生成的 manifest，后续主版本升级需要同步审核这些格式。`heic2any` 的浏览器解码器带有 Emscripten 的 Node `fs` 条件分支，不能用简单全文搜索 `fs` 判定泄漏；检查不声称消除了第三方库中的全部 Node 分支文本。

## 可复现验证

```powershell
yarn install --frozen-lockfile
yarn lint
yarn typecheck --incremental false
yarn test:ci --runInBand
yarn build
yarn export
yarn verify:export
yarn app:build --bundles 'nsis,msi'
```

不要并发运行共享 `.next` 的构建、开发服务器和类型生成。静态导出会替换 Web 构建产物；切换运行方式时应重新执行对应构建。

| 检查                           | 本地结果                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Yarn 冻结安装                  | 通过，另外验证了缓存可用时的离线冻结安装                                              |
| ESLint                         | 通过，0 errors；43 warnings，含新版本诊断及既有规则警告                               |
| TypeScript                     | 通过；`next typegen` 生成类型，`tsc --noEmit --incremental false` 检查                |
| Jest                           | 47 个套件、273 项通过；包含新增的 8 项路由回归与 10 项聊天回归                        |
| 最终 Turbopack standalone 构建 | 通过                                                                                  |
| standalone 真实服务            | 首页、16 个静态资源、公开配置、CORS 与 provider 未授权响应通过；无应用 Server Actions |
| Turbopack 静态导出与检查       | 通过，66 个 JavaScript 文件、37 处 HTML 框架资源引用，无 API 路由或 Server Actions    |
| Windows release / NSIS / MSI   | 通过；安装包为 `src-tauri/target/release/bundle` 下的未签名验证产物                   |

新增路由测试验证 Promise 参数、真实 handler 分发、代理 URL、用户/服务端鉴权、禁止路径、错误状态与正文、分段 SSE 无缓冲透传、Upstash/WebDAV 同步以及公开配置不包含服务端密钥。上游请求使用测试替身，不调用付费模型服务。

删除 MCP 后重新执行上述检查、生产 HTTP 检查与 Windows 打包。验证全部使用命令行，没有使用 Computer Use 或其他界面自动化，没有启动安装器或已安装客户端。没有触碰真实用户资料；临时 HTTP 服务已停止。完整拖拽、导出/剪贴板、覆盖安装、真实模型请求及跨操作系统体验尚未验收。框架升级阶段还曾用命令行验证 Web 开发首页与配置接口为 200、桌面开发首页为 200 且 `/api/config` 为 404。

Docker daemon 在本机未运行，因此没有实际构建/启动容器；已核对 Docker 的 Node 24 和 standalone 拷贝布局，并把依赖安装改为官方 registry 的冻结安装。Vercel 未部署；保留原路由 runtime、区域、headers、rewrites 与统计集成，通过 Web 构建作基础验证。macOS/Linux 本地未执行，已有三平台桌面 CI 继续负责其原生构建。

CI 现在在 PR 更新时执行冻结安装、独立 lint、类型检查、测试、Web 构建及桌面导出检查；桌面工作流继续构建三平台未签名包，并验证对应导出产物。未推送、触发远程工作流或发布安装包。

## 已知警告与安全审计

构建仍报告旧 Sass `@import` 弃用、静态预渲染时 localStorage 不可用，以及 Edge Runtime / `preferredRegion` 弃用。这些没有阻止构建；本次保留部署语义，未顺带切换 API runtime 或重构样式。

2026-10-26 删除 MCP 后重新向官方 npm registry 执行 `yarn audit`，从基线 290 条受影响依赖路径降至 237 条：low 37、moderate 77、high 122、critical 1，共 36 个独立公告。当前 Next 包告警为 0；按 GitHub advisory ID 对照，未新增公告。仍存在其他业务和工具依赖告警，因此不能宣称全项目依赖已无漏洞。

剩余 critical 为测试链 `jest-environment-jsdom > jsdom > form-data@4.0.0` 的 [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4)。修复测试工具链及其余 Markdown/图表等依赖应单独安排并验收，避免把所有依赖主版本更新合并进框架迁移。本轮审计原始数据与摘要保留在忽略的 `.cache/remove-mcp-yarn-audit.jsonl`、`.cache/remove-mcp-audit-summary.json`，验证日志为 `.cache/remove-mcp-*.log`；前一阶段记录仍在 `.cache/next16-*`。

## 回退

发布前保留原安装包，并用原有功能备份聊天、模型提供商和设置。Web 部署保留上一构建的静态资源，避免已打开页面在切换版本时丢失 chunk。

如需回退，在独立 checkout 恢复上述基线提交及其 `yarn.lock`，使用 Node 24 重新冻结安装、构建。桌面沿用现有 Tauri 2 身份和来源，安装旧包时不删除资料；Web 回滚应用与同次构建的资源。不要清空 localStorage 或用户资料目录作为升级/回退步骤。
