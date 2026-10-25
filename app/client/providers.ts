import type { LLMModel } from "./api";
import { collectModels } from "../utils/model";
import {
  VISION_MODEL_REGEXES,
  EXCLUDE_VISION_MODEL_REGEXES,
} from "../constant";

export const PROVIDER_PROTOCOLS = {
  "openai-chat": "OpenAI Chat Completions",
  "openai-responses": "OpenAI Responses",
  anthropic: "Anthropic Messages",
  google: "Gemini",
} as const;
export type ProviderProtocol = keyof typeof PROVIDER_PROTOCOLS;
// Mirrors the AI SDK `reasoning` call setting; each protocol maps it to its own option.
export const REASONING_LEVELS = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];
// Passed to the AI SDK call as-is; unset keys leave the provider default.
export type ModelParams = {
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxOutputTokens?: number;
  reasoning?: Exclude<ReasoningLevel, "provider-default">;
};
const PARAM_RANGES = {
  temperature: [0, 2],
  topP: [0, 1],
  presencePenalty: [-2, 2],
  frequencyPenalty: [-2, 2],
  maxOutputTokens: [1, Number.MAX_SAFE_INTEGER],
} as const;
// Anthropic Messages and OpenAI Responses do not accept penalties.
export const supportsPenalties = (protocol: ProviderProtocol) =>
  protocol === "openai-chat" || protocol === "google";
export const maxTemperature = (protocol: ProviderProtocol) =>
  protocol === "anthropic" ? 1 : 2;
export function normalizeModelParams(
  value: unknown,
  protocol: ProviderProtocol,
): ModelParams {
  const source = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const params: ModelParams = {};
  for (const [key, [min, max]] of Object.entries(PARAM_RANGES)) {
    const v = source[key];
    if (
      typeof v === "number" &&
      v >= min &&
      v <= max &&
      (key !== "maxOutputTokens" || Number.isInteger(v))
    )
      params[key as keyof typeof PARAM_RANGES] = v;
  }
  // Keep only what the current protocol can send, e.g. after a protocol switch.
  if (params.temperature !== undefined)
    params.temperature = Math.min(params.temperature, maxTemperature(protocol));
  if (!supportsPenalties(protocol)) {
    delete params.presencePenalty;
    delete params.frequencyPenalty;
  }
  const reasoning = source.reasoning as ReasoningLevel;
  if (REASONING_LEVELS.includes(reasoning) && reasoning !== "provider-default")
    params.reasoning = reasoning;
  return params;
}
export type ProviderModel = {
  id: string;
  displayName: string;
  enabled: boolean;
  vision: boolean;
  params: ModelParams;
  providerOptions: Record<string, Record<string, unknown>>;
};
export type ProviderInstance = {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  models: ProviderModel[];
  enabled: boolean;
};
export const PROTOCOL_BASE_URLS: Record<ProviderProtocol, string> = {
  "openai-chat": "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};
export function createProviderModel(id: string): ProviderModel {
  return {
    id: id.trim(),
    displayName: id.trim(),
    enabled: true,
    vision: false,
    params: {},
    providerOptions: {},
  };
}
export function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("基础地址须为 HTTP(S) 地址，不包含账户、查询参数或片段。");
  }
  return url.toString().replace(/\/+$/, "");
}
export function normalizeProviders(value: unknown): ProviderInstance[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value
    .filter((p): p is ProviderInstance => {
      if (
        !p ||
        typeof p.id !== "string" ||
        !p.id ||
        ids.has(p.id) ||
        !Object.hasOwn(PROVIDER_PROTOCOLS, p.protocol)
      )
        return false;
      ids.add(p.id);
      return true;
    })
    .map((p) => ({
      ...p,
      name: String(p.name || p.id),
      baseUrl: String(p.baseUrl || ""),
      apiKey: String(p.apiKey || ""),
      headers: Object.fromEntries(
        Object.entries(p.headers || {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      enabled: p.enabled !== false,
      models: Array.from(
        new Map(
          (Array.isArray(p.models) ? p.models : [])
            .filter((m) => m && typeof m.id === "string" && m.id.trim())
            // `sampling` was the old per-model switch, superseded by `params`.
            .map(
              ({
                sampling: _sampling,
                ...m
              }: ProviderModel & { sampling?: unknown }) => [
                m.id,
                {
                  ...createProviderModel(m.id),
                  ...m,
                  enabled: m.enabled !== false,
                  params: normalizeModelParams(m.params, p.protocol),
                  providerOptions: m.providerOptions || {},
                },
              ],
            ),
        ).values(),
      ),
    }));
}
// Old sessions keep their legacy route until an instance is explicitly selected.
export function migrateLegacyProviders(
  access: Record<string, unknown>,
  models: readonly LLMModel[],
  customModels = "",
): ProviderInstance[] {
  if (Array.isArray(access.providers))
    return normalizeProviders(access.providers);
  const mappings: [string, string, ProviderProtocol, string][] = [
    ["OpenAI", "openai", "openai-chat", "v1"],
    ["Google", "google", "google", "v1beta"],
    ["Anthropic", "anthropic", "anthropic", "v1"],
    ["DeepSeek", "deepseek", "openai-chat", ""],
    ["Moonshot", "moonshot", "openai-chat", "v1"],
    ["XAI", "xai", "openai-chat", "v1"],
    ["SiliconFlow", "siliconflow", "openai-chat", "v1"],
    ["302.AI", "ai302", "openai-chat", "v1"],
    ["ChatGLM", "chatglm", "openai-chat", "api/paas/v4"],
    ["ByteDance", "bytedance", "openai-chat", "api/v3"],
  ];
  return mappings.flatMap(([name, prefix, protocol, version]) => {
    const apiKey = String(access[`${prefix}ApiKey`] || "");
    let baseUrl = String(access[`${prefix}Url`] || "").replace(/\/+$/, "");
    if (!apiKey || !baseUrl || baseUrl.startsWith("/")) return [];
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    const hasVersion =
      /\/(?:v\d+(?:beta\d*)?|api\/paas\/v\d+|api\/v\d+)$/i.test(baseUrl);
    if (version && !hasVersion) baseUrl += `/${version}`;
    const entries = collectModels(models, customModels)
      .filter(
        (m) => m.provider?.providerName.toLowerCase() === name.toLowerCase(),
      )
      .map((m) => ({
        ...createProviderModel(m.name),
        enabled: m.available,
        displayName: m.displayName || m.name,
        vision:
          !EXCLUDE_VISION_MODEL_REGEXES.some((r) => r.test(m.name)) &&
          (VISION_MODEL_REGEXES.some((r) => r.test(m.name)) ||
            String(access.visionModels || "")
              .split(",")
              .includes(m.name)),
      }));
    return [
      {
        id: `legacy-${prefix}`,
        name,
        protocol,
        baseUrl,
        apiKey,
        headers: {},
        models: Array.from(new Map(entries.map((m) => [m.id, m])).values()),
        enabled: true,
      },
    ];
  });
}
export function instanceModels(providers: ProviderInstance[]): LLMModel[] {
  return providers.flatMap((p, i) =>
    p.models.map((m, j) => ({
      name: m.id,
      displayName: m.displayName || m.id,
      available: p.enabled && m.enabled,
      provider: {
        id: p.id,
        providerName: p.name,
        providerType: "ai-sdk",
        sorted: -2000 + i,
      },
      sorted: j,
    })),
  );
}
export function modelSelection(
  model: string,
  providerName: string,
  providerId?: string,
): string {
  return providerId
    ? JSON.stringify([providerId, model])
    : `${model}@${providerName}`;
}
export function parseModelSelection(value: string) {
  if (value.startsWith("[")) {
    const [providerId, model] = JSON.parse(value) as [string, string];
    return { model, providerId, providerName: "" };
  }
  const [model, providerName = ""] = value.split(/@(?!.*@)/);
  return { model, providerName, providerId: undefined };
}
export function llmModelSelection(model: {
  name: string;
  provider?: LLMModel["provider"];
}): string {
  return modelSelection(
    model.name,
    model.provider?.providerName || "",
    model.provider?.providerType === "ai-sdk" ? model.provider.id : undefined,
  );
}

export function summaryTarget(config: {
  model: string;
  providerName: string;
  providerId?: string;
  compressModel: string;
  compressProviderName: string;
  compressProviderId?: string;
}) {
  return config.compressModel
    ? {
        model: config.compressModel,
        providerName: config.compressProviderName,
        providerId: config.compressProviderId,
      }
    : {
        model: config.model,
        providerName: config.providerName,
        providerId: config.providerId,
      };
}

export function instanceSupportsImages(
  providers: ProviderInstance[],
  providerId: string,
  modelId: string,
): boolean {
  const provider = providers.find((p) => p.id === providerId);
  return !!(
    provider?.enabled &&
    provider.models.find((m) => m.id === modelId && m.enabled)?.vision
  );
}
