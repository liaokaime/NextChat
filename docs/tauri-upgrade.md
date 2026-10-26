# Tauri 2 升级记录

核对日期：2026-10-26。基线提交：`01ad5fc35fd9da11bafc935e21e541fe3a911dc8`。升级分支：`chore/tauri-2-upgrade`。

## 官方依据与版本

按 [Tauri 1 → 2 迁移指南](https://v2.tauri.app/start/migrate/from-tauri-1/)执行官方迁移工具，再逐项审核配置、插件和调用代码。版本以 npm、crates.io 的稳定版本及官方发布记录核对；JS API 与 Rust 核心保持相同 minor，CLI 与 API 保持相同版本，插件的 JS/Rust 两端分别锁定相同版本，参见[依赖升级规则](https://v2.tauri.app/develop/updating-dependencies/)。

| 组件                                | 升级后版本 |
| ----------------------------------- | ---------- |
| Rust `tauri`                        | 2.12.5     |
| `@tauri-apps/api` / CLI             | 2.12.4     |
| `tauri-build`                       | 2.7.4      |
| dialog 插件（JS / Rust）            | 2.8.3      |
| fs 插件（JS / Rust）                | 2.7.1      |
| clipboard-manager 插件（JS / Rust） | 2.5.0      |
| opener 插件（JS / Rust）            | 2.7.2      |
| reqwest                             | 0.13.5     |
| Rust 工具链                         | 1.99.1     |

原项目 Rust 核心为 Tauri 1.5.x、CLI 为 1.5.11，JS API 已是 2.x，存在跨主版本混用。现在统一为 Tauri 2，并提交更新后的 `Cargo.lock`、`yarn.lock` 和 `rust-toolchain.toml`。不改变 rustup 的全局默认工具链。

## 配置及数据兼容

- 配置迁移至 v2 的 `build` / `bundle` / `app` 结构；构建版本读取位置同步改为顶层 `version`。
- 产品名 `NextChat`、版本 `2.16.1`、标识 `com.yida.chatgpt.next.web` 保持原值，Windows 二进制名保持 `NextChat.exe`。不改动应用存储键、provider 配置、聊天数据或备份格式。
- Windows 显式设置 `useHttpsScheme: false`，延续 v1 的 `dangerousUseHttpScheme: true`，保留 `http://tauri.localhost` 来源，避免由于来源变化导致 localStorage 不可见。macOS/Linux 延续 `tauri://localhost`；不指定新的数据目录。参见[迁移指南中的协议说明](https://v2.tauri.app/start/migrate/from-tauri-1/)。
- 按本次范围保留 `csp: null`。关闭全局 `window.__TAURI__`，前端全部使用类型化模块导入。
- 自动更新继续关闭：不注册 updater 插件，`createUpdaterArtifacts: false`，CI 不上传 updater JSON 或签名文件。

上述存储兼容结论基于官方说明、配置和源码对照；不把它等同于已完成所有操作系统的覆盖安装验收。本次不操作真实用户配置目录。

## 插件与 IPC 权限

权限文件为 `src-tauri/capabilities/desktop.json`，仅适用于桌面平台的本地 `main` 窗口，没有远程 URL 授权。设计依据为 [Capabilities](https://v2.tauri.app/security/capabilities/) 和官方插件文档。

| 对接                      | 权限与行为                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| 文本、JSON、Markdown 导出 | `dialog:allow-save`、`fs:allow-write-text-file`                                                      |
| PNG 导出                  | `fs:allow-write-file`，使用 v2 `writeFile`                                                           |
| 文件路径                  | 无全盘通配授权；由官方保存对话框在选择后动态允许该文件；保留 `fs:deny-default` 保护 WebView 数据目录 |
| 剪贴板                    | 仅 `clipboard-manager:allow-write-text`，等待原生写入成功再提示；失败时保留浏览器降级                |
| 外部链接                  | opener 仅允许 HTTP、HTTPS、mailto、tel；不允许文件打开或自定义协议                                   |
| 窗口拖动                  | 仅拖动与标题栏双击所需的两个 window 命令                                                             |
| 流式请求                  | 仅事件订阅/取消及 `stream_fetch`、`cancel_stream`；自定义命令通过 `AppManifest` 加入 ACL             |

未引入 shell/http 插件，也没有文件读取、目录遍历或远程内容的原生命令权限。保存对话框取消、写入失败和剪贴板失败均有明确处理。

流式桥接保持原请求/响应结构。Rust 使用 `Emitter` 和 `EventTarget::WebviewWindow` 定向发送事件；JS 先订阅再调用命令，按 request ID 隔离请求，取消和结束时清理监听。HEAD、204、205、304 响应按无正文处理。reqwest 显式使用 native TLS，并启用系统代理支持，延续原有桌面网络方式。

参考插件文档：[dialog](https://v2.tauri.app/plugin/dialog/)、[fs](https://v2.tauri.app/plugin/file-system/)、[clipboard](https://v2.tauri.app/plugin/clipboard/)、[opener](https://v2.tauri.app/plugin/opener/)。保存路径的动态授权另对照了 dialog 2.8.3 的 Rust 源码。

## 构建及发布

需要 Node.js 24、Yarn 1、rustup 及[官方原生构建依赖](https://v2.tauri.app/start/prerequisites/)。Windows 需要 MSVC C++ 工具链和 WebView2；Linux 使用 WebKitGTK 4.1；macOS Universal 同时安装 `x86_64-apple-darwin`、`aarch64-apple-darwin`。

```powershell
yarn install --frozen-lockfile
yarn typecheck --incremental false
yarn test:ci --runInBand
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
yarn app:build --bundles 'nsis,msi'
```

`scripts/build-app.cjs` 直接调用固定版本 CLI，并自动将 `--locked` 放在 Cargo 参数区。原生 CLI 对应命令为 `node node_modules/@tauri-apps/cli/tauri.js build --bundles nsis,msi -- --locked`。`--locked` 不是 Tauri 的顶层参数；Yarn 1 的嵌套脚本会消耗 `--` 分隔符。两个 CI 工作流同样通过 `tauriScript` 直接启动 Node CLI，避免参数被 Yarn 消耗。PowerShell 中包含逗号的 bundles 值需要引号。

- `tauri-check.yml` 对 Windows、macOS Universal、Linux 执行 Rust 检查、测试和未签名打包，只上传 workflow artifacts。前端检查在 Linux 执行。
- `app.yml` 只构建当前发布事件对应的 release，或手动输入的现有 release tag。检出该 tag，并核对 tag 与产品版本，避免把其他提交上传到“最新 release”。保留 draft/prerelease 状态，不自动推广正式版。
- 两者共享 `.github/actions/setup-tauri/action.yml`。官方 tauri-action 固定为 `action-v1.0.0`。正式 macOS 签名沿用现有 Apple secrets。

本次没有推送分支、触发远程工作流或发布安装包。

## 验证结果

| 检查                                          | 本地结果                                                  |
| --------------------------------------------- | --------------------------------------------------------- |
| Yarn 冻结安装                                 | 通过                                                      |
| TypeScript 类型检查                           | 通过                                                      |
| Jest                                          | 49 个套件、276 项测试通过                                 |
| Rust 格式 / check / Clippy（warnings 为错误） | 通过                                                      |
| Rust 原生 IPC 测试                            | 5 项通过，使用真实插件、能力配置和 MockRuntime，不启动 UI |
| 桌面静态导出 + Windows release 编译           | 通过                                                      |
| Windows NSIS / MSI 打包                       | 通过                                                      |
| 普通网页版 `yarn build`                       | 通过                                                      |
| CI YAML 与 tauri-action 输入名称              | 解析通过，输入与固定版本官方 action 定义一致              |
| macOS Universal / Linux 原生构建              | 已配置 CI；本地 Windows 环境未执行                        |

原生 IPC 测试覆盖本地主窗口允许、其他窗口/远程来源拒绝、未选择文件拒写、选择路径授权后写入中文内容、文件读取拒绝、危险 URL 协议拒绝、HTTP 状态/请求体/请求头/UTF-8 错误正文传递，以及响应头前后取消请求时实际关闭 HTTP 连接。前端测试另覆盖早到事件、并发隔离、监听清理、错误及浏览器回退。

本次按用户要求侧重 Tauri 对接，不继续做 UI 自动化，也不将覆盖安装、真实资料迁移或跨平台运行体验记作已验收。Windows 本地产物位于 `src-tauri/target/release/bundle/nsis/` 和 `bundle/msi/`；验证日志保存在被 Git 忽略的 `.cache/tauri-*.log`。

## 安全审计与已知限制

Rust 使用 cargo-audit 0.22.2，RustSec 数据库截至 2026-10-24。结果为 `vulnerabilities.count = 0`，同时保留以下上游告警，没有加入忽略规则或替换为未经官方验证的依赖补丁：

| 依赖                   | 告警                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| glib 0.18.5            | [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)：`VariantStrIter` 内存安全问题，归于 `unsound`；来自 Linux GTK 依赖栈，修复版本为 0.20+，不能直接替换不兼容的 GTK 绑定版本 |
| proc-macro-error 1.0.4 | [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html)：停止维护                                                                                                                  |
| zvariant 5.15.1        | [RUSTSEC-2026-0370](https://rustsec.org/advisories/RUSTSEC-2026-0370.html)：停止作为独立 crate 维护                                                                                                   |
| zbus_names 4.3.5       | [RUSTSEC-2026-0371](https://rustsec.org/advisories/RUSTSEC-2026-0371.html)：停止作为独立 crate 维护                                                                                                   |
| zvariant_derive 5.15.1 | [RUSTSEC-2026-0372](https://rustsec.org/advisories/RUSTSEC-2026-0372.html)：停止作为独立 crate 维护                                                                                                   |

不能据此宣称 Rust 依赖“零风险”；尤其 Linux 的 glib 告警需要跟踪 Tauri/GTK 上游后续修复。

`yarn audit` 报告 290 条受影响依赖路径（84 个独立 advisory）：low 39、moderate 97、high 150、critical 4。所有受影响包/版本均已存在于基线锁文件；Tauri 包告警为 0，本次新增 advisory 为 0。critical 涉及 Next 14.2.35 的 [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36)、[GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)、[GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw)，以及 form-data 4.0.0 的 [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4)。

本次不扩大为 Next.js 主版本及全部前端依赖升级；上述问题仍需单独修复，网页版服务端部署尤其需要评估。完整本地审计数据位于 `.cache/tauri-cargo-audit.json`、`.cache/tauri-yarn-audit-summary.json` 和 `.cache/tauri-yarn-audit.jsonl`。

## 回退

1. 发布前保留当前版本安装包；退出应用后备份标识 `com.yida.chatgpt.next.web` 对应的应用资料目录，并使用现有备份导出功能备份聊天/设置。备份可能包含密钥，应按原有保管方式处理。
2. 如需回退，在独立 checkout 恢复上述基线提交、两份锁文件及对应旧工具链/构建环境；不要在用户资料目录运行清理命令。
3. 重新安装保留的旧包，不勾选删除应用数据。产品版本本次保持 2.16.1，因此覆盖安装/降级还需验证具体安装器的同版本行为；当前仅证明包可构建。
4. 启动旧版核对会话、provider、设置；必要时在退出应用后还原备份。不要把自动更新开关打开作为回退手段。

本地另外保留了升级前 `NextChat.exe` 的副本 `.cache/tauri-v1/NextChat.exe`，SHA-256 为 `BEC9ACA4D0EA137B668D62E990D11EFA8F262725E41DFE62D01C267E6F3F6C88`。该副本和隔离测试目录均不提交 Git。
