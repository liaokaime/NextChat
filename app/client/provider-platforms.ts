import type { ProviderProtocol } from "./providers";

export type ProviderPlatform = {
  id: string;
  name: string;
  aliases: readonly string[];
  defaultProtocol: ProviderProtocol;
  baseUrls: Partial<Record<ProviderProtocol, string>>;
};

// Platform names and endpoint facts referenced from Cherry Studio's provider catalog:
// https://github.com/CherryHQ/cherry-studio/blob/10b5fc4db9692e1e3a4bf09abefdb503078c37d4/packages/provider-registry/data/providers.json
// Store COMPLETE SDK base URLs here: our SDKs only append endpoint paths.
// Cherry Studio adds version prefixes separately; copying its raw hosts would lose them.
// OpenAI and Ollama additionally expose their standard Chat Completions endpoints.
// OAuth, IAM, Azure, embedding-only and deployment-specific integrations are omitted.
export const PROVIDER_PLATFORMS: readonly ProviderPlatform[] = [
  {
    id: "openai",
    defaultProtocol: "openai-chat",
    name: "OpenAI",
    aliases: [],
    baseUrls: {
      "openai-responses": "https://api.openai.com/v1",
      "openai-chat": "https://api.openai.com/v1",
    },
  },
  {
    id: "anthropic",
    defaultProtocol: "anthropic",
    name: "Anthropic",
    aliases: ["Claude"],
    baseUrls: {
      anthropic: "https://api.anthropic.com/v1",
    },
  },
  {
    id: "gemini",
    defaultProtocol: "google",
    name: "Gemini",
    aliases: ["Google", "谷歌"],
    baseUrls: {
      google: "https://generativelanguage.googleapis.com/v1beta",
    },
  },
  {
    id: "deepseek",
    defaultProtocol: "openai-chat",
    name: "DeepSeek",
    aliases: ["深度求索"],
    baseUrls: {
      anthropic: "https://api.deepseek.com/anthropic/v1",
      "openai-chat": "https://api.deepseek.com/v1",
      "openai-responses": "https://api.deepseek.com/v1",
    },
  },
  {
    id: "silicon",
    defaultProtocol: "openai-chat",
    name: "SiliconFlow",
    aliases: ["SiliconFlow", "硅基流动"],
    baseUrls: {
      anthropic: "https://api.siliconflow.cn/v1",
      "openai-chat": "https://api.siliconflow.cn/v1",
    },
  },
  {
    id: "dashscope",
    defaultProtocol: "openai-chat",
    name: "阿里百炼",
    aliases: ["阿里百炼", "通义千问", "Qwen", "Alibaba"],
    baseUrls: {
      anthropic: "https://dashscope.aliyuncs.com/apps/anthropic/v1",
      "openai-chat": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "openai-responses": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
  },
  {
    id: "zhipu",
    defaultProtocol: "openai-chat",
    name: "智谱 AI",
    aliases: ["智谱", "智谱清言", "BigModel", "ChatGLM"],
    baseUrls: {
      anthropic: "https://open.bigmodel.cn/api/anthropic/v1",
      "openai-chat": "https://open.bigmodel.cn/api/paas/v4",
    },
  },
  {
    id: "moonshot",
    defaultProtocol: "openai-chat",
    name: "Moonshot AI",
    aliases: ["月之暗面", "Kimi", "国内"],
    baseUrls: {
      anthropic: "https://api.moonshot.cn/anthropic/v1",
      "openai-chat": "https://api.moonshot.cn/v1",
    },
  },
  {
    id: "doubao",
    defaultProtocol: "openai-chat",
    name: "豆包 / 火山引擎",
    aliases: ["豆包", "火山引擎", "字节跳动", "ByteDance", "Volcengine"],
    baseUrls: {
      "openai-chat": "https://ark.cn-beijing.volces.com/api/v3",
      "openai-responses": "https://ark.cn-beijing.volces.com/api/v3",
    },
  },
  {
    id: "minimax",
    defaultProtocol: "openai-chat",
    name: "MiniMax",
    aliases: ["海螺", "国内"],
    baseUrls: {
      anthropic: "https://api.minimaxi.com/anthropic/v1",
      "openai-chat": "https://api.minimaxi.com/v1",
    },
  },
  {
    id: "openrouter",
    defaultProtocol: "openai-chat",
    name: "OpenRouter",
    aliases: [],
    baseUrls: {
      anthropic: "https://openrouter.ai/api/v1",
      "openai-chat": "https://openrouter.ai/api/v1",
    },
  },
  {
    id: "aihubmix",
    defaultProtocol: "openai-chat",
    name: "AiHubMix",
    aliases: [],
    baseUrls: {
      anthropic: "https://aihubmix.com/v1",
      google: "https://aihubmix.com/gemini/v1beta",
      "openai-chat": "https://aihubmix.com/v1",
      "openai-responses": "https://aihubmix.com/v1",
    },
  },
  {
    id: "302ai",
    defaultProtocol: "openai-chat",
    name: "302.AI",
    aliases: [],
    baseUrls: {
      anthropic: "https://api.302.ai/v1",
      "openai-chat": "https://api.302.ai/v1",
    },
  },
  {
    id: "cherryin",
    defaultProtocol: "openai-chat",
    name: "CherryIN",
    aliases: [],
    baseUrls: {
      anthropic: "https://open.cherryin.net/v1",
      google: "https://open.cherryin.net/v1beta",
      "openai-chat": "https://open.cherryin.net/v1",
      "openai-responses": "https://open.cherryin.net/v1",
    },
  },
  {
    id: "ovms",
    defaultProtocol: "openai-chat",
    name: "OpenVINO Model Server",
    aliases: ["OpenVINO", "Intel", "本地"],
    baseUrls: {
      "openai-chat": "http://localhost:8000/v3",
    },
  },
  {
    id: "ocoolai",
    defaultProtocol: "openai-chat",
    name: "ocoolAI",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.ocoolai.com/v1",
    },
  },
  {
    id: "alayanew",
    defaultProtocol: "openai-chat",
    name: "AlayaNew",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://deepseek.alayanew.com/v1",
    },
  },
  {
    id: "dmxapi",
    defaultProtocol: "openai-chat",
    name: "DMXAPI",
    aliases: [],
    baseUrls: {
      anthropic: "https://www.dmxapi.cn/v1",
      google: "https://www.dmxapi.cn/v1beta",
      "openai-chat": "https://www.dmxapi.cn/v1",
    },
  },
  {
    id: "aionly",
    defaultProtocol: "openai-chat",
    name: "AIOnly",
    aliases: [],
    baseUrls: {
      anthropic: "https://api.aiionly.com/v1",
      google: "https://api.aiionly.com/v1beta",
      "openai-chat": "https://api.aiionly.com/v1",
      "openai-responses": "https://api.aiionly.com/v1",
    },
  },
  {
    id: "burncloud",
    defaultProtocol: "openai-chat",
    name: "BurnCloud",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://ai.burncloud.com/v1",
    },
  },
  {
    id: "lanyun",
    defaultProtocol: "openai-chat",
    name: "LANYUN",
    aliases: ["蓝耘"],
    baseUrls: {
      "openai-chat": "https://maas-api.lanyun.net/v1",
    },
  },
  {
    id: "ph8",
    defaultProtocol: "openai-chat",
    name: "PH8",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://ph8.co/v1",
    },
  },
  {
    id: "sophnet",
    defaultProtocol: "openai-chat",
    name: "SophNet",
    aliases: ["硅基智流"],
    baseUrls: {
      "openai-chat": "https://www.sophnet.com/api/open-apis/v1",
    },
  },
  {
    id: "ppio",
    defaultProtocol: "openai-chat",
    name: "PPIO",
    aliases: ["派欧云"],
    baseUrls: {
      "openai-chat": "https://api.ppinfra.com/v3/openai",
    },
  },
  {
    id: "qiniu",
    defaultProtocol: "openai-chat",
    name: "七牛云",
    aliases: ["七牛云"],
    baseUrls: {
      anthropic: "https://api.qnaigc.com/v1",
      "openai-chat": "https://api.qnaigc.com/v1",
    },
  },
  {
    id: "ollama",
    defaultProtocol: "openai-chat",
    name: "Ollama",
    aliases: ["本地"],
    baseUrls: {
      anthropic: "http://localhost:11434/v1",
      "openai-chat": "http://localhost:11434/v1",
    },
  },
  {
    id: "radeon-cloud",
    defaultProtocol: "openai-chat",
    name: "AMD GPU Cloud",
    aliases: ["AMD"],
    baseUrls: {
      "openai-chat": "https://developer.amd.com.cn/radeon/v1",
    },
  },
  {
    id: "tokendance",
    defaultProtocol: "openai-chat",
    name: "TokenDance",
    aliases: [],
    baseUrls: {
      anthropic: "https://tokendance.space/gateway/v1",
      google: "https://tokendance.space/gateway/v1beta",
      "openai-chat": "https://tokendance.space/gateway/v1",
      "openai-responses": "https://tokendance.space/gateway/v1",
    },
  },
  {
    id: "new-api",
    defaultProtocol: "openai-chat",
    name: "New API",
    aliases: ["本地", "中转"],
    baseUrls: {
      anthropic: "http://localhost:3000/v1",
      google: "http://localhost:3000/v1beta",
      "openai-chat": "http://localhost:3000/v1",
      "openai-responses": "http://localhost:3000/v1",
    },
  },
  {
    id: "lmstudio",
    defaultProtocol: "openai-chat",
    name: "LM Studio",
    aliases: ["本地"],
    baseUrls: {
      anthropic: "http://localhost:1234/v1",
      "openai-chat": "http://localhost:1234/v1",
    },
  },
  {
    id: "litellm",
    defaultProtocol: "openai-chat",
    name: "LiteLLM",
    aliases: ["本地"],
    baseUrls: {
      "openai-chat": "http://localhost:4000/v1",
    },
  },
  {
    id: "omlx",
    defaultProtocol: "openai-chat",
    name: "oMLX",
    aliases: ["本地"],
    baseUrls: {
      anthropic: "http://localhost:8000/v1",
      "openai-chat": "http://localhost:8000/v1",
      "openai-responses": "http://localhost:8000/v1",
    },
  },
  {
    id: "opencode",
    defaultProtocol: "openai-chat",
    name: "OpenCode Go",
    aliases: [],
    baseUrls: {
      anthropic: "https://opencode.ai/zen/go/v1",
      "openai-chat": "https://opencode.ai/zen/go/v1",
      "openai-responses": "https://opencode.ai/zen/go/v1",
    },
  },
  {
    id: "moonshot-global",
    defaultProtocol: "openai-chat",
    name: "Moonshot International",
    aliases: ["Kimi", "国际"],
    baseUrls: {
      anthropic: "https://api.moonshot.ai/anthropic/v1",
      "openai-chat": "https://api.moonshot.ai/v1",
    },
  },
  {
    id: "baichuan",
    defaultProtocol: "openai-chat",
    name: "BAICHUAN AI",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.baichuan-ai.com/v1",
    },
  },
  {
    id: "stepfun",
    defaultProtocol: "openai-chat",
    name: "StepFun",
    aliases: ["阶跃星辰"],
    baseUrls: {
      anthropic: "https://api.stepfun.com/v1",
      "openai-chat": "https://api.stepfun.com/v1",
    },
  },
  {
    id: "groq",
    defaultProtocol: "openai-chat",
    name: "Groq",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.groq.com/openai/v1",
    },
  },
  {
    id: "together",
    defaultProtocol: "openai-chat",
    name: "Together",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.together.ai/v1",
    },
  },
  {
    id: "fireworks",
    defaultProtocol: "openai-chat",
    name: "Fireworks",
    aliases: [],
    baseUrls: {
      anthropic: "https://api.fireworks.ai/inference/v1",
      "openai-chat": "https://api.fireworks.ai/inference/v1",
      "openai-responses": "https://api.fireworks.ai/inference/v1",
    },
  },
  {
    id: "nvidia",
    defaultProtocol: "openai-chat",
    name: "NVIDIA",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://integrate.api.nvidia.com/v1",
    },
  },
  {
    id: "grok",
    defaultProtocol: "openai-chat",
    name: "xAI / Grok",
    aliases: ["xAI"],
    baseUrls: {
      "openai-chat": "https://api.x.ai/v1",
      "openai-responses": "https://api.x.ai/v1",
    },
  },
  {
    id: "mistral",
    defaultProtocol: "openai-chat",
    name: "Mistral",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.mistral.ai/v1",
    },
  },
  {
    id: "jina",
    defaultProtocol: "openai-chat",
    name: "Jina",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.jina.ai/v1",
    },
  },
  {
    id: "perplexity",
    defaultProtocol: "openai-chat",
    name: "Perplexity",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.perplexity.ai",
    },
  },
  {
    id: "modelscope",
    defaultProtocol: "openai-chat",
    name: "ModelScope / 魔搭",
    aliases: ["魔搭"],
    baseUrls: {
      anthropic: "https://api-inference.modelscope.cn/v1",
      "openai-chat": "https://api-inference.modelscope.cn/v1",
    },
  },
  {
    id: "xirang",
    defaultProtocol: "openai-chat",
    name: "Xirang",
    aliases: ["天翼云", "息壤"],
    baseUrls: {
      "openai-chat": "https://wishub-x1.ctyun.cn/v1",
    },
  },
  {
    id: "tokenhub",
    defaultProtocol: "openai-chat",
    name: "腾讯 TokenHub",
    aliases: ["腾讯", "Tencent"],
    baseUrls: {
      anthropic: "https://tokenhub.tencentmaas.com/v1",
      "openai-chat": "https://tokenhub.tencentmaas.com/v1",
      "openai-responses": "https://tokenhub.tencentmaas.com/v1",
    },
  },
  {
    id: "baidu-cloud",
    defaultProtocol: "openai-chat",
    name: "百度千帆",
    aliases: ["百度千帆", "Qianfan"],
    baseUrls: {
      "openai-chat": "https://qianfan.baidubce.com/v2",
    },
  },
  {
    id: "poe",
    defaultProtocol: "openai-chat",
    name: "Poe",
    aliases: [],
    baseUrls: {
      anthropic: "https://api.poe.com/v1",
      "openai-chat": "https://api.poe.com/v1",
      "openai-responses": "https://api.poe.com/v1",
    },
  },
  {
    id: "longcat",
    defaultProtocol: "openai-chat",
    name: "LongCat",
    aliases: [],
    baseUrls: {
      anthropic: "https://api.longcat.chat/anthropic/v1",
      "openai-chat": "https://api.longcat.chat/openai/v1",
    },
  },
  {
    id: "huggingface",
    defaultProtocol: "openai-chat",
    name: "Hugging Face",
    aliases: [],
    baseUrls: {
      anthropic: "https://router.huggingface.co/v1",
      "openai-chat": "https://router.huggingface.co/v1",
      "openai-responses": "https://router.huggingface.co/v1",
    },
  },
  {
    id: "cerebras",
    defaultProtocol: "openai-chat",
    name: "Cerebras AI",
    aliases: [],
    baseUrls: {
      "openai-chat": "https://api.cerebras.ai/v1",
    },
  },
  {
    id: "mimo",
    defaultProtocol: "openai-chat",
    name: "Xiaomi MiMo",
    aliases: ["小米", "Xiaomi"],
    baseUrls: {
      anthropic: "https://api.xiaomimimo.com/anthropic/v1",
      "openai-chat": "https://api.xiaomimimo.com/v1",
      "openai-responses": "https://api.xiaomimimo.com/v1",
    },
  },
  {
    id: "zai",
    defaultProtocol: "openai-chat",
    name: "Z.AI",
    aliases: ["智谱", "国际"],
    baseUrls: {
      anthropic: "https://api.z.ai/api/anthropic/v1",
      "openai-chat": "https://api.z.ai/api/paas/v4",
    },
  },
  {
    id: "minimax-global",
    defaultProtocol: "openai-chat",
    name: "MiniMax International",
    aliases: ["海螺", "国际"],
    baseUrls: {
      anthropic: "https://api.minimax.io/anthropic/v1",
      "openai-chat": "https://api.minimax.io/v1",
    },
  },
];
