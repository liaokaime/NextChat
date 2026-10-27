# 内置模型目录审计（2026-10-24）

本次检查覆盖 `DEFAULT_MODELS` 的全部 15 个供应商来源、内置面具、默认模型、摘要模型、新连接模板及本地缓存合并。旧目录有 239 条供应商/型号记录；移除 232 条旧记录，保留仍可核实的 7 条记录，并加入 25 条官方目录中的现行文本对话型号。新目录共 32 条记录（同一型号在不同供应商下分别计数）。

## 清理原则

- 官方已退役或已宣布弃用的型号不再作为内置推荐，例如 Claude 1/2/3、Claude 4 初版、Gemini 1.5/2.0、GPT-4.5 preview、o1 preview/mini、GPT-4o、GPT-5 初版、DALL·E 3。
- 清理被现行型号替代的旧预览、beta、实验、日期快照、重复别名与旧系列，优先使用已核实的现行稳定 ID。移出推荐目录不等于认定这些型号在所有第三方平台均已停服。
- 百度原接入使用旧版专用路径，不能直接套用千帆新目录中的型号；火山服务需要实际推理接入点，腾讯原预设目录未取得有效的现行型号证据。这三个来源停止提供旧静态预设，保留接入功能，通过自定义连接获取实际模型或手动填写 ID。
- 302.AI 接入已整体移除，包括设置、适配器、代理路由及环境变量。旧密钥和自动迁移连接在恢复数据时清理；会话与面具的原模型引用保留，需要手动重新选择，失效引用不会自动改用其他服务商。
- Azure 沿用 OpenAI 的候选型号；实际使用仍需填写自己资源中的部署名称，不保证某型号已在该资源或区域部署。
- 更新新用户默认模型、内置面具默认模型以及摘要常量。已有会话、面具和用户选择不自动改路由；原引用失效时由用户重新选择。
- 本地配置合并只清理旧内置目录中明确列出的记录，按型号与供应商 ID 去重。用户显式保存的连接模型列表、自定义模型字符串、第三方实例和其它服务端返回型号继续保留。移除清单仅用于旧缓存清理，不参与模型选择列表。
- 新版 OpenAI 与 Claude 推理模型不再发送不支持的采样参数；图片能力识别覆盖新增的 GPT、Gemini、Kimi 和 DeepSeek Flash 型号。未做带用户密钥的收费 API 实测。

## 官方资料

以下页面已在本次审计中实际读取；抓取文本保存在本地 `build/research/`，供检查时复核。

| 来源               | 文档与处理                                                                                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI Docs        | [弃用计划](https://developers.openai.com/api/docs/deprecations)、[现行模型](https://developers.openai.com/api/docs/models)、[GPT-6 Luna 接口能力](https://developers.openai.com/api/docs/models/gpt-6-luna)：移除已弃用/旧系列，加入 GPT-6 系列；保留未在弃用表中的 GPT-4.1 nano 与 o4-mini。 |
| Google             | [退役计划](https://ai.google.dev/gemini-api/docs/deprecations)：旧预览和 Gemini 2.0 已关闭；2.5 未宣布退役但限制为已有使用者，新目录采用现行 Flash。                                                                                                                                          |
| Anthropic          | [模型状态与退役记录](https://platform.claude.com/docs/en/about-claude/model-deprecations)：原目录中的所有型号均已退役；替换为 Active 型号。                                                                                                                                                   |
| DeepSeek           | [现行型号](https://api-docs.deepseek.com/quick_start/pricing)：采用 `deepseek-flash` 与 `deepseek-v4-pro`，同步更新添加连接模板。                                                                                                                                                             |
| xAI                | [现行模型](https://docs.x.ai/docs/models)：采用官方当前推荐的 `grok-4.7`，移除旧 beta、快照及重复别名。                                                                                                                                                                                       |
| Moonshot           | [官方快速开始](https://platform.moonshot.ai/docs/guide/kimi-k2-5-quickstart)：该地址现已指向新版快速开始，示例为 Kimi K3.1 Pro 与 Highspeed。                                                                                                                                                 |
| 阿里云             | [模型目录](https://www.alibabacloud.com/help/en/model-studio/models)：采用页面中的现行 Qwen 文本系列。                                                                                                                                                                                        |
| 智谱               | [官方模型文档](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.6)：目录已列出现行 GLM-5.3 与 Flash；移除旧 GLM-4/CogView 预设。                                                                                                                                                           |
| 硅基流动           | [文本生成指南](https://docs.siliconflow.cn/cn/userguide/capabilities/text-generation)：采用当前示例模型，旧开源型号不再内置推荐，不宣称原权重已失效。                                                                                                                                         |
| 讯飞               | [服务说明](https://www.xfyun.cn/doc/spark/Web.html)：Max 套餐已于 2026-03-10 下线并升级 Ultra，删除 `generalv3.5`；旧 `general` 不再推荐，保留文档中的 Ultra、Pro 与 Pro-128K。                                                                                                               |
| 百度               | [现行千帆模型](https://cloud.baidu.com/doc/qianfan/s/rmh4stp0j)：现行 API 与项目旧接入路径不同，不将新 ID 错配到旧路径。                                                                                                                                                                      |
| 火山、腾讯 | 检查了官方文档入口；未获得可直接用于现有专用适配器的可靠静态目录，改为由实际账号/服务配置模型。 |

## 验证

回归覆盖目录不包含移除项、默认型号存在、旧缓存升级去重与清理、自定义别名和中转实例保留，以及新版 OpenAI/Claude 请求不发送采样参数。页面继续使用现有标题栏、列表控件、按钮和主题变量，并检查宽窄布局及深浅主题。

最终验证：类型检查通过，44 个测试套件、219 个测试全部通过；桌面静态导出、Rust release 编译和 Windows x64 NSIS 安装包生成成功。浏览器检查覆盖 1280×900、960×600 和 375×812，确认搜索、保存、取消修改、手动添加及明暗主题正常，无页面横向溢出。Kimi/DeepSeek Flash 的旧适配器补齐图片内容转发并通过请求体回归验证。
