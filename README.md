# NextChat 自定义版

基于 [NextChat](https://github.com/chatgptnextweb/nextchat) 的个人 fork，重点改进桌面端的模型提供商管理、模型配置与聊天体验，同时保留 Web 自部署能力。

[本仓库](https://github.com/liaokaime/NextChat) · [问题反馈](https://github.com/liaokaime/NextChat/issues) · [桌面版配置指南](./docs/desktop-providers.md) · [开源协议](./LICENSE)

## 本 fork 的主要改动

- **桌面端多提供商**：通过统一入口管理官方服务、中转和本地服务；同一种协议可以配置多个实例，各自保存地址、密钥、自定义请求头与模型列表。
- **四种 API 协议**：新提供商使用 Vercel AI SDK，支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Gemini。
- **模型管理**：支持常见平台预设、获取或手动添加模型、连接测试、图片输入，以及按模型配置生成参数和推理强度。
- **聊天体验**：支持独立的「思考过程」展示、标题和正文搜索、单独删除聊天会话，以及全局模型与会话模型配置。
- **Markdown 渲染**：使用 Streamdown，支持代码高亮、LaTeX 公式、Mermaid 图表及流式内容；保留聊天导出和 HTML 预览。
- **技术栈更新**：Next.js 16、React 19、Tauri 2、Tailwind CSS 4，开发与构建要求 Node.js 24+。

继续支持面具（自定义提示词模板）、历史摘要、本地备份，以及 WebDAV / Upstash 同步。内置模型已重新清理，具体来源与范围见[内置模型审计](./docs/builtin-model-audit.md)。

本 fork 已移除 MCP、实时语音聊天及语音相关功能、插件、Stable Diffusion 入口和上游商业推广。旧发现菜单中的历史搜索已移除，当前可通过侧栏搜索会话。新提供商暂不支持原生工具调用。

## 桌面版

桌面版使用 Tauri 2 加载本地静态页面，通过原生网络桥接请求模型服务，不需要另外运行 Next.js 服务端。API 地址与密钥在应用内配置。

### 快速配置

1. 打开「设置 → 模型提供商」，点击「新建提供商」。
2. 选择常见平台，或手动填写名称、接口兼容类型和 API 基础地址，再填写 API 密钥；不需要鉴权的本地服务可以留空。
3. 点击「获取模型列表」，或手动添加服务商提供的实际模型 ID。显示名称仅用于界面。
4. 按需开启模型的「图片输入」，在模型行的「参数」中设置生成参数、推理强度或模型专用选项。
5. 保存配置，选择已启用的模型进行「测试连接」，再从聊天中的模型选择器切换到该模型。

| 接口兼容类型            | 官方基础地址示例                                   |
| ----------------------- | -------------------------------------------------- |
| OpenAI Chat Completions | `https://api.openai.com/v1`                        |
| OpenAI Responses        | `https://api.openai.com/v1`                        |
| Anthropic Messages      | `https://api.anthropic.com/v1`                     |
| Gemini                  | `https://generativelanguage.googleapis.com/v1beta` |

基础地址应保留服务商要求的版本或路由前缀，不要填写完整聊天接口路径；应用会追加对应协议的请求路径。协议取决于服务商实际支持的接口，不能只根据模型名称选择。获取列表失败时可以手动添加模型，获取成功也不代表聊天接口可用。

新提供商的生成参数默认使用「服务商默认」，只有勾选自定义才发送设定值。聊天、标题、历史摘要和连接测试使用对应模型的参数。压缩模型可单独指定，也可以跟随当前模型。

原有提供商仍可在同一个管理入口编辑，继续使用原请求方式。旧会话保留原有路由，手动选择新提供商的模型后才切换。详细说明见[桌面版模型提供商](./docs/desktop-providers.md)。

### 开发与构建

前置条件：

- Node.js **24 或更高版本**、Yarn **1.22.19**。
- rustup；项目通过 `rust-toolchain.toml` 固定 Rust **1.99.1**。
- Windows 需要 MSVC C++ 构建工具和 WebView2。其他平台依赖见 [Tauri 官方前置条件](https://v2.tauri.app/start/prerequisites/)。

获取本 fork 并安装依赖：

```sh
git clone https://github.com/liaokaime/NextChat.git
cd NextChat
yarn install --frozen-lockfile
```

启动桌面开发模式：

```sh
yarn app:dev
```

Windows 构建 NSIS 安装包：

```powershell
yarn app:build --bundles nsis
```

安装包位于 `src-tauri/target/release/bundle/nsis/`，可执行文件为 `src-tauri/target/release/NextChat.exe`。同时构建 MSI 可使用 `yarn app:build --bundles 'nsis,msi'`。包装脚本会自动向 Cargo 传递 `--locked`。

如需单独构建并检查桌面前端：

```sh
yarn export
yarn verify:export
```

`yarn export` 输出到 `out/`，不包含 Next.js API 路由。该产物用于桌面端；将它作为普通静态网站托管，不会获得 Tauri 原生网络与文件能力。

Windows 安装包已有本地构建验证记录；macOS 和 Linux 配有 CI 构建流程，实际安装与运行情况需在对应平台验证。权限、平台依赖和构建细节见 [Tauri 升级记录](./docs/tauri-upgrade.md)。

## Web 开发与部署

Web 版仍使用原有提供商设置与 Next.js 服务端路由，未采用桌面端新建多提供商的配置界面。可以由部署者配置服务端 API 密钥，也可以允许用户在设置中填写自己的密钥。模型服务的使用费用由对应服务商收取。

以下命令均在本 fork 的项目根目录执行，依赖安装方式与桌面版相同。

### 本地开发

在根目录创建 `.env.local`。例如，使用服务端 OpenAI 密钥时：

```dotenv
OPENAI_API_KEY=sk-your-api-key
CODE=replace-with-a-long-random-access-code
# 使用兼容中转时按需设置，Web 原有 OpenAI 路由会追加 /v1/...
# BASE_URL=https://your-relay.example.com
```

也可以使用其他提供商的环境变量，或让用户自行填写密钥，`OPENAI_API_KEY` 不是所有使用方式都必填。可参考 [.env.template](./.env.template)，具体含义以[环境变量](#环境变量)和代码实际读取项为准。

```sh
yarn dev
```

默认访问 `http://localhost:3000`；端口被占用时以终端输出为准。`yarn dev` 仅用于开发。

### Node.js standalone 部署

`yarn build` 默认生成 standalone 服务。生产部署使用其中的 `server.js` 启动，并复制静态资源；不使用 `yarn start` 启动 standalone 产物。

Linux / macOS：

```sh
yarn build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
node --env-file=.env.local .next/standalone/server.js
```

Windows PowerShell：

```powershell
yarn build
Copy-Item -Recurse -Force public .next/standalone/
Copy-Item -Recurse -Force .next/static .next/standalone/.next/
node --env-file=.env.local .next/standalone/server.js
```

上述示例显式加载根目录的 `.env.local`。部署到其他机器时，复制整理后的 `.next/standalone/`，通过运行环境提供密钥；如果使用环境文件，应将 `--env-file` 指向实际位置。监听地址和端口可通过运行环境中的 `HOSTNAME`、`PORT` 设置。构建期间读取的配置变更后应重新构建；运行时配置变更后应重启服务。

### Docker 部署

从本 fork 的源码构建镜像：

```sh
docker build -t nextchat-custom:local .
docker run -d --name nextchat-custom -p 3000:3000 --env-file .env.local -e HOSTNAME=0.0.0.0 --restart unless-stopped nextchat-custom:local
```

`.env.local` 在运行时通过 `--env-file` 注入，已被 `.dockerignore` 排除，不会随源码复制进镜像。仅填写需要的变量；直接复制 `.env.template` 时，应删除或修改其中的示例值，尤其是 `PROXY_URL`。

容器需要出站代理时可设置 `PROXY_URL=http://host:port`；地址必须能从容器内访问，容器里的 `127.0.0.1` 指向容器自身。

也可使用仓库中的 `docker-compose.yml` 从本 fork 源码构建。配置好 `.env.local` 后执行 `docker compose --env-file .env.local --profile no-proxy up -d --build`；需要出站代理时改用 `--profile proxy`，并配置 `PROXY_URL`。

### Vercel 部署

1. Fork [本仓库](https://github.com/liaokaime/NextChat)，或将本 fork 的代码推送到自己的仓库。
2. 在 Vercel 中导入该仓库，使用 Next.js 预设，选择 Node.js 24，安装命令使用 `yarn install --frozen-lockfile`，构建命令使用 `yarn build`。
3. 在项目设置中添加所需提供商的密钥和 `CODE` 等环境变量，然后部署。
4. 修改环境变量后重新部署；按需绑定自己的域名。

### 配置页面访问密码

`CODE` 用于保护 Web 版的服务端密钥，可用英文逗号配置多个访问码：

```dotenv
CODE=first-long-random-code,second-long-random-code
```

用户在设置页填写访问码后，可使用部署者提供的密钥。未设置 `CODE` 时，访客可以直接使用已配置的服务端密钥；公开部署应设置足够长的随机访问码。

默认也允许用户提供自己的 API 密钥，此时无需访问码。若要禁用用户自行填写密钥并只允许访问码方式，设置 `HIDE_USER_API_KEY=1`。这属于有限访问控制，不提供独立用户账号或企业权限管理。桌面版在本地配置提供商，不使用此访问码。

## 环境变量

除特别说明外，以下变量用于 Web 服务端。桌面静态包没有 `/api/config` 或模型代理服务，应在应用的「模型提供商」中配置地址、密钥和模型。

### 常用配置

| 变量                     | 说明                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`         | 服务端 OpenAI 密钥；支持英文逗号分隔多个密钥，每次读取配置时随机选择。仅在使用此服务端凭据时需要。                             |
| `BASE_URL`               | 原有 OpenAI 路由的基础地址，默认 `https://api.openai.com`，路由会追加 `/v1/...`。与桌面新提供商通常包含 `/v1` 的地址写法不同。 |
| `OPENAI_ORG_ID`          | 可选的 OpenAI 组织 ID。                                                                                                        |
| `CODE`                   | Web 访问码，支持英文逗号分隔，见[配置页面访问密码](#配置页面访问密码)。                                                        |
| `HIDE_USER_API_KEY`      | 禁止用户使用自己的 API 密钥。                                                                                                  |
| `DISABLE_GPT4`           | 按现有识别规则限制 GPT-4 及部分推理模型，不是通用的模型权限管理。                                                              |
| `ENABLE_BALANCE_QUERY`   | 显示原有 OpenAI 余额查询入口；是否可用取决于服务商是否仍支持对应接口。                                                         |
| `DISABLE_FAST_LINK`      | 禁用通过链接解析预制设置。                                                                                                     |
| `CUSTOM_MODELS`          | 调整原有提供商的模型列表，支持新增、隐藏和自定义显示名称。                                                                     |
| `DEFAULT_MODEL`          | 设置原有提供商的默认模型；可用 `模型名@提供商` 指定来源。                                                                      |
| `VISION_MODELS`          | 英文逗号分隔的模型名，为原有视觉模型匹配规则补充图片输入能力。                                                                 |
| `WHITE_WEBDAV_ENDPOINTS` | WebDAV 代理额外允许的完整 endpoint，多个地址用英文逗号分隔。                                                                   |
| `PROXY_URL`              | 容器启动脚本使用的出站代理，不是桌面提供商地址。                                                                               |
| `DEFAULT_INPUT_TEMPLATE` | 默认输入预处理模板，在构建时写入前端配置，也适用于桌面构建。                                                                   |

`HIDE_USER_API_KEY`、`DISABLE_GPT4`、`ENABLE_BALANCE_QUERY`、`DISABLE_FAST_LINK` 按变量是否为非空字符串判断：启用可填 `1`，关闭请删除或留空；字符串 `0`、`false` 也会被视为启用。

`CUSTOM_MODELS` 示例：

```dotenv
CUSTOM_MODELS=-all,+my-model@openai=自定义模型
DEFAULT_MODEL=my-model@openai
VISION_MODELS=my-model
```

此例先隐藏全部原有模型，再添加实际 ID 为 `my-model` 的 OpenAI 兼容模型。请将 ID 替换为服务商提供的模型名。`+` 添加、`-` 隐藏、`模型名=显示名` 修改显示名称。桌面新提供商的模型与图片输入应直接在界面中维护。

### 提供商凭据

按需配置，不需要同时填写所有服务商。下表列出当前代码读取的服务端配置项；不同原有提供商追加路径的方式不同，不应直接套用桌面新提供商的基础地址。

| 提供商               | 环境变量                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Azure OpenAI         | `AZURE_URL`、`AZURE_API_KEY`、`AZURE_API_VERSION`；基础地址形如 `https://{resource}.openai.azure.com/openai`，版本与部署名称需匹配 Azure 资源。 |
| Google Gemini        | `GOOGLE_API_KEY`、`GOOGLE_URL`                                                                                                                  |
| Anthropic            | `ANTHROPIC_API_KEY`、`ANTHROPIC_URL`、`ANTHROPIC_API_VERSION`                                                                                   |
| DeepSeek             | `DEEPSEEK_API_KEY`、`DEEPSEEK_URL`                                                                                                              |
| xAI                  | `XAI_API_KEY`、`XAI_URL`                                                                                                                        |
| Moonshot             | `MOONSHOT_API_KEY`、`MOONSHOT_URL`                                                                                                              |
| SiliconFlow          | `SILICONFLOW_API_KEY`、`SILICONFLOW_URL`                                                                                                        |
| 百度                 | `BAIDU_API_KEY`、`BAIDU_SECRET_KEY`、`BAIDU_URL`                                                                                                |
| 字节跳动             | `BYTEDANCE_API_KEY`、`BYTEDANCE_URL`                                                                                                            |
| 阿里云               | `ALIBABA_API_KEY`、`ALIBABA_URL`                                                                                                                |
| 讯飞                 | `IFLYTEK_API_KEY`、`IFLYTEK_API_SECRET`、`IFLYTEK_URL`                                                                                          |
| 智谱                 | `CHATGLM_API_KEY`、`CHATGLM_URL`                                                                                                                |
| 腾讯混元原有签名接口 | `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`、`TENCENT_URL`；签名使用 Secret ID / Secret Key，模板中的 `TENCENT_API_KEY` 不能替代它们。            |

其他部署配置可查阅 [Web 服务端配置](./app/config/server.ts) 与[构建配置](./app/config/build.ts)。已移除功能对应的 `ENABLE_MCP`、`STABILITY_API_KEY`、`STABILITY_URL` 不再生效；Next.js 升级后也不再使用 `DISABLE_CHUNK`。

## 数据、备份与同步

- 聊天、面具和设置保存在本地浏览器或桌面 WebView 存储中；发送消息时，请求内容仍会交给配置的模型服务商处理。
- 可在设置中导出和恢复备份，或配置 WebDAV / Upstash 同步。桌面静态包不提供同步代理路由，使用这些同步功能需要可访问的兼容 NextChat 同步代理服务，并在同步设置中填写代理地址。
- 备份和同步数据包含提供商 API 密钥及连接配置，请妥善保管。删除或停用提供商后，受影响会话的引用会保留，需要手动重新选择模型。
- 「删除所有聊天会话」删除聊天和草稿，保留设置、提供商与面具，并创建一个空白会话；「清除所有数据」会清除全部本地数据。
- 当前桌面版保持原有应用标识 `com.yida.chatgpt.next.web` 和存储位置。升级、覆盖安装或回退前应备份数据；这不代表所有旧版本之间的降级已经验证。

## 更新与开发检查

桌面客户端的上游自动更新已关闭，更新本 fork 应使用本仓库对应版本的安装包或重新构建。上游官方安装包、镜像和演示站不包含此 fork 的自定义功能。

已移除上游定时同步、向上游镜像仓库发布以及自动翻译 issue 的工作流。合并上游更新时应先审查差异、处理冲突并验证。

常用开发检查：

```sh
yarn typecheck
yarn lint
yarn test:ci --runInBand
yarn build
yarn export
yarn verify:export
```

Web 构建与桌面导出共用 `.next/` 目录，切换后应重新运行所需模式的构建。

## 详细文档

- [桌面版模型提供商与模型参数](./docs/desktop-providers.md)
- [内置模型审计](./docs/builtin-model-audit.md)
- [Tauri 2 升级、平台依赖与构建记录](./docs/tauri-upgrade.md)
- [Next.js 16 升级记录](./docs/nextjs-16-upgrade.md)
- [Markdown 与 Tailwind 样式迁移](./docs/markdown-tailwind-migration.md)

仓库内部分较早的部署教程、FAQ 和截图沿用上游版本，涉及功能、依赖版本与部署入口时，以本 README 和当前实现为准。

## 致谢与许可证

感谢 [NextChat](https://github.com/chatgptnextweb/nextchat) 原作者、贡献者及本项目使用的开源依赖。本 fork 沿用 [MIT 许可证](./LICENSE)，保留原有版权声明。
