# 桌面版服务商与中转

Windows 客户端在「设置 → 服务商与中转」中使用 Vercel AI SDK 接入模型。同一种协议可以配置多个实例，各自保存地址、密钥、请求头与模型列表。网页版继续使用原有 provider 与服务端路由。

## 配置

1. 点击「添加」，填写名称、协议、API 基础地址及密钥。
2. 点击「获取模型列表」，或手动填写服务商提供的实际模型 ID。显示名称仅用于界面，不会发给 API。
3. 需要看图的模型，勾选「图片输入」。需要 temperature、top_p 等参数的模型，勾选「发送温度等采样参数」；默认关闭，以兼容推理模型。
4. 保存后，在聊天输入框旁的模型菜单中选择对应实例，也可以在全局模型设置或面具中选择。

| 协议                    | 官方基础地址示例                                   | SDK 追加的聊天路径                      |
| ----------------------- | -------------------------------------------------- | --------------------------------------- |
| OpenAI Chat Completions | `https://api.openai.com/v1`                        | `/chat/completions`                     |
| OpenAI Responses        | `https://api.openai.com/v1`                        | `/responses`                            |
| Anthropic Messages      | `https://api.anthropic.com/v1`                     | `/messages`                             |
| Gemini                  | `https://generativelanguage.googleapis.com/v1beta` | `/models/{model}:streamGenerateContent` |

使用中转时，将基础地址替换为中转提供的地址，并保留其版本或路由前缀，例如 `https://example.com/anthropic/v1`。不要填写完整聊天接口路径。协议由中转实际支持的接口决定，与模型名称无关。模型列表接口为基础地址后的 `/models`，中转未提供该接口时可手动添加模型。

自定义请求头使用 JSON 对象，同名请求头会覆盖默认值，例如 `{"X-Route":"personal"}`。默认分别使用 Bearer、`x-api-key` 或 `x-goog-api-key` 鉴权；也支持不需要密钥的本地兼容服务。

## 模型选项与推理

API 返回的独立 reasoning/thinking 内容显示在回复的「思考过程」折叠区，并随聊天保存。后续请求只发送正文，不重放思考内容；推理签名与加密推理状态不在此版本中往返传递。

「模型专用选项」使用 AI SDK 对应 provider 的命名空间。OpenAI Responses 可填写 `{"openai":{"reasoningEffort":"high","reasoningSummary":"auto"}}`；Anthropic 可填写 `{"anthropic":{"thinking":{"type":"enabled","budgetTokens":1024}}}`。实际支持的选项取决于模型与中转。通用 Chat Completions 使用 `relay` 命名空间，其支持范围取决于 `@ai-sdk/openai-compatible`，不是任意请求体透传。

标题和历史摘要默认使用当前实例与模型；可在模型设置中单独指定压缩模型。停止生成会保留已收到的正文和思考内容。连接中断、HTTP 错误与不完整流会作为失败显示，不自动重试。

## 旧数据、备份与边界

- 首次启动会将已有的兼容 provider 配置复制为独立实例，保留旧地址、密钥、模型别名及启停状态。旧会话继续使用原有路由，手动选择新实例后才切换。
- 删除或停用实例后，引用它的会话会提示重新选择模型。实例 ID 与显示名称分开保存，重命名不会改变会话路由。
- 新实例包含在现有备份与同步数据中。恢复旧格式备份时会迁移；同步按更新时间完整替换 provider 列表。备份中含 API 密钥，请按原有备份方式妥善保管。
- 新实例支持文本、图片输入、流式输出及独立推理展示。朗读和原有图像生成保留原入口；新实例暂不支持原生工具调用或 MCP。
- 已移除实时聊天、NextChat AI 推广、GitHub 图标按钮及发现菜单下的插件、Stable Diffusion、历史搜索。
- 静态桌面包不运行 Next.js 服务端或 stdio MCP。网页版的 MCP 实现保留。
- 应用标识与存储位置保持原值，上游自动更新已关闭，避免覆盖自定义版本。

## 本地构建

使用 Node.js 24+、Yarn 1、Rust/MSVC 与 Windows WebView2 构建环境：

```powershell
yarn install --frozen-lockfile
yarn typecheck
yarn test:ci --runInBand
yarn app:build --bundles nsis
```

安装包输出到 `src-tauri/target/release/bundle/nsis/`，可执行文件为 `src-tauri/target/release/nextchat.exe`。`yarn export` 可单独验证桌面静态页面构建。
