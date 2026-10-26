# Markdown 与样式迁移

项目使用 Streamdown 2.7.1 渲染聊天正文、思考过程、图片导出预览和分享用 HTML。代码高亮采用 `@streamdown/code` / Shiki，公式采用 `@streamdown/math` / KaTeX，中文标记采用 `@streamdown/cjk`。版本固定在 `package.json` 和 `yarn.lock` 中。

## 保留原有外观

- `app/styles/globals.css` 是唯一全局样式入口，使用 Tailwind CSS v4 / PostCSS。没有引入 Preflight，保留现有浏览器表单默认值、盒模型和字体行为。
- 原来的 15 组 CSS Modules 迁为同名 `*.styles.ts` 静态 Tailwind 配方。配方保留像素值、600px 断点、后代选择器和交互状态；数组只用于分行，构建时扫描的是完整静态类名。
- `nc-*` 类名仅作为结构或状态标记，没有独立 CSS 定义。例如 `nc-home-sidebar-show` 必须与对应的配方一起使用。不要动态拼接 Tailwind 类名。
- 组合状态的配方通过自身标记增加选择器权重，避免 Tailwind 排序覆盖侧栏显隐、最大化模态框、选中会话等状态。无需依赖 JSX 中类名的书写顺序。
- `app/styles/markdown.css` 保留生成 HTML 所需的排版规则；主题变量、滚动条、关键帧和第三方 KaTeX 样式继续使用原生 CSS。仓库不再需要 Sass。
- 代码块继续使用 Tokyo Night 暗色背景与接近原来的配色。语法标记来自 Shiki，具体 token 颜色可能与 highlight.js 略有不同。

## 渲染约定

`Markdown` 的聊天调用始终传 `mode="streaming"`，通过 `isStreaming` 更新流式状态。不要用该状态修改 React `key`，否则展开的代码块会在结束时重挂载。导出调用默认使用 `static` 模式，二者共享插件、组件与排版。

Streamdown 管理分块和未闭合标记补全；`prepareMarkdown` 兼容 `\(...\)`、`\[...\]` 和完整 HTML 文档，同时保护代码围栏及行内代码。保留原来的单换行显示行为。未完成的链接先显示文字。

普通 Markdown 内的 HTML 显示为文本。完整 HTML 文档和 HTML/SVG/XML 代码走现有 iframe sandbox。围栏未闭合时只显示源码；围栏闭合或消息结束后才加载预览。Mermaid 按需导入，渲染失败保留源码并清理临时容器。

代码高亮直接消费源码，复制按钮也复制源码，不从高亮后的 DOM 反推。超过 400px 的代码继续支持折叠；展开状态在后续片段和流结束时保留。高亮不可用时回退纯文本。

## 主题与导出

`watchTheme` 在 `document.documentElement` 上统一设置解析后的 light/dark 状态。auto 模式监听系统主题变化，手动主题不受系统变化影响。

`waitForMarkdown` 等待字体、代码高亮、Mermaid/HTML 预览和图片，再交给 `html-to-image`。导出区域隐藏操作控件并展开代码；分享 HTML 清理的是 DOM 副本。不要重新给 React 管理的元素赋值 `innerHTML`。

## 验证

```sh
yarn typecheck
yarn lint
yarn test:ci --runInBand
yarn build
yarn export
yarn verify:export
```

迁移前 47 个套件 / 273 个测试通过，迁移后 50 个套件 / 288 个测试通过。新增回归覆盖公式、中文加粗、表格、脚注、HTML 转义、未闭合链接/强调、代码高亮与原文复制、预览时机、无效 Mermaid、折叠状态保留和系统主题变化。浏览器核对了桌面关键尺寸、599/600/601px 断点、浅色/深色和真实公式/代码/图表。图片导出预览中的公式、图表已就绪，操作控件不可见。

Tailwind v4 面向现代浏览器。静态构建验证不等于原生 Tauri 安装包的实机验证；浏览器下载、剪贴板权限和跨域图片仍由运行环境决定。完整 PNG 下载验证遇到浏览器自动化超时，未确认文件落盘。本次没有给出帧率或相对旧引擎的性能倍数结论。
