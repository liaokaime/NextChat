import { ServiceProvider } from "../constant";
import * as Constants from "../constant";
import type { LLMModel } from "./api";
import {
  createProviderModel,
  instanceModels,
  llmModelSelection,
  migrateLegacyProviders,
  type ProviderInstance,
  type ProviderModel,
} from "./providers";

export type LegacyConnectionMeta = {
  name: string;
  enabled: boolean;
  hidden?: boolean;
  models?: ProviderModel[];
};
export type LegacyConnections = Record<string, LegacyConnectionMeta>;
export type ConnectionAccess = Record<string, unknown> & {
  providers: ProviderInstance[];
  legacyConnections: LegacyConnections;
};
export type ConnectionView = {
  key: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  models: ProviderModel[];
} & (
  | { kind: "sdk"; instance: ProviderInstance }
  | { kind: "legacy"; service: ServiceProvider }
);

export const LEGACY_PREFIXES: Record<ServiceProvider, string> = {
  OpenAI: "openai",
  Azure: "azure",
  Google: "google",
  Anthropic: "anthropic",
  Baidu: "baidu",
  ByteDance: "bytedance",
  Alibaba: "alibaba",
  Tencent: "tencent",
  Moonshot: "moonshot",
  Iflytek: "iflytek",
  XAI: "xai",
  ChatGLM: "chatglm",
  DeepSeek: "deepseek",
  SiliconFlow: "siliconflow",
  "302.AI": "ai302",
};
export const legacyKey = (service: string) => `legacy:${service}`;
export const sdkKey = (id: string) => `sdk:${id}`;
export function legacyFields(service: ServiceProvider) {
  return [
    "Url",
    "ApiKey",
    "SecretKey",
    "SecretId",
    "ApiSecret",
    "ApiVersion",
    "SafetySettings",
  ].map((suffix) => LEGACY_PREFIXES[service] + suffix);
}
export function legacyConfigured(
  access: Record<string, unknown>,
  service: ServiceProvider,
) {
  const meta = (access.legacyConnections as LegacyConnections | undefined)?.[
    service
  ];
  if (meta?.hidden) return false;
  const defaultUrlName =
    service === ServiceProvider.Google
      ? "GEMINI"
      : service === ServiceProvider.ByteDance
      ? "BYTEDANCE"
      : service === ServiceProvider["302.AI"]
      ? "AI302"
      : service.toUpperCase();
  const defaultUrl = (Constants as unknown as Record<string, unknown>)[
    `${defaultUrlName}_BASE_URL`
  ];
  const url = String(access[LEGACY_PREFIXES[service] + "Url"] || "");
  const customUrl =
    !!access.useCustomConfig &&
    /^https?:\/\//i.test(url) &&
    url.replace(/\/+$/, "") !== String(defaultUrl || "").replace(/\/+$/, "");
  return (
    !!meta ||
    customUrl ||
    legacyFields(service).some(
      (key) =>
        /(?:ApiKey|SecretKey|SecretId|ApiSecret)$/.test(key) && !!access[key],
    )
  );
}
export function normalizeLegacyConnections(value: unknown): LegacyConnections {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([service, meta]) => {
      if (
        !Object.values(ServiceProvider).includes(service as ServiceProvider) ||
        !meta ||
        typeof meta !== "object"
      )
        return [];
      const entry = meta as LegacyConnectionMeta;
      return [
        [
          service,
          {
            name:
              typeof entry.name === "string" && entry.name.trim()
                ? entry.name
                : service,
            enabled: entry.enabled !== false,
            hidden: entry.hidden === true,
            ...(Array.isArray(entry.models)
              ? {
                  models: entry.models
                    .filter((m) => m && typeof m.id === "string" && m.id.trim())
                    .map((m) => ({ ...createProviderModel(m.id), ...m })),
                }
              : {}),
          },
        ],
      ];
    }),
  );
}
export function connectionViews(
  access: ConnectionAccess,
  legacy: readonly LLMModel[],
  referencedServices: string[] = [],
): ConnectionView[] {
  const result: ConnectionView[] = access.providers.map((instance) => ({
    key: sdkKey(instance.id),
    kind: "sdk",
    instance,
    name: instance.name,
    baseUrl: instance.baseUrl,
    enabled: instance.enabled,
    models: instance.models,
  }));
  for (const service of Object.values(ServiceProvider)) {
    const meta = access.legacyConnections[service];
    if (
      meta?.hidden ||
      (!legacyConfigured(access, service) &&
        !referencedServices.includes(service))
    )
      continue;
    const models =
      meta?.models ??
      legacy
        .filter(
          (m) =>
            m.provider?.providerName.toLowerCase() === service.toLowerCase(),
        )
        .map((m) => ({
          ...createProviderModel(m.name),
          displayName: m.displayName || m.name,
          enabled: m.available,
        }));
    result.push({
      key: legacyKey(service),
      kind: "legacy",
      service,
      name: meta?.name || service,
      baseUrl: String(access[LEGACY_PREFIXES[service] + "Url"] || ""),
      enabled: meta?.enabled !== false,
      models,
    });
  }
  const names = new Map<string, number>();
  return result.map((view) => {
    const count = (names.get(view.name) || 0) + 1;
    names.set(view.name, count);
    return {
      ...view,
      name: count === 1 ? view.name : `${view.name} (${count})`,
    };
  });
}
export function desktopConnectionModels(
  access: ConnectionAccess,
  legacy: readonly LLMModel[],
): LLMModel[] {
  const views = connectionViews(access, legacy);
  const names = new Map(views.map((view) => [view.key, view.name]));
  const sdk = instanceModels(access.providers).map((model) => ({
    ...model,
    provider: {
      ...model.provider,
      connectionName: names.get(sdkKey(model.provider.id)),
    },
  }));
  const builtin = views
    .filter((v) => v.kind === "legacy")
    .flatMap((v) => {
      if (v.kind !== "legacy") return [];
      return v.models.map((m, index) => ({
        name: m.id,
        displayName: m.displayName,
        available: v.enabled && m.enabled,
        provider: {
          id: v.service.toLowerCase(),
          providerName: v.service,
          providerType: "builtin",
          sorted: index,
          connectionName: v.name,
        },
        sorted: index,
      }));
    });
  return [...sdk, ...builtin];
}
export const modelConnectionKey = (model: {
  provider?: LLMModel["provider"];
}) =>
  model.provider?.providerType === "ai-sdk"
    ? sdkKey(model.provider.id)
    : legacyKey(model.provider?.providerName || ServiceProvider.OpenAI);
export const modelConnectionName = (model: {
  provider?: LLMModel["provider"];
}) => model.provider?.connectionName || model.provider?.providerName || "";

export type ModelReference = {
  model?: string;
  providerName?: string;
  providerId?: string;
  compressModel?: string;
  compressProviderName?: string;
  compressProviderId?: string;
};
export function referencesConnection(
  ref: ModelReference,
  view: Pick<ConnectionView, "key">,
) {
  const main = ref.providerId
    ? sdkKey(ref.providerId)
    : legacyKey(ref.providerName || ServiceProvider.OpenAI);
  const compress = ref.compressModel
    ? ref.compressProviderId
      ? sdkKey(ref.compressProviderId)
      : legacyKey(ref.compressProviderName || ServiceProvider.OpenAI)
    : main;
  return main === view.key || compress === view.key;
}
// Only untouched automatic copies without any saved reference can be removed.
export function pruneUnusedImportedProviders(
  access: Record<string, unknown>,
  models: readonly LLMModel[],
  customModels: string,
  refs: ModelReference[],
) {
  const expected = migrateLegacyProviders(
    { ...access, providers: undefined },
    models,
    customModels,
  );
  const signature = (p: ProviderInstance) =>
    JSON.stringify([
      p.id,
      p.name,
      p.protocol,
      p.baseUrl,
      p.apiKey,
      Object.entries(p.headers).sort(),
      p.enabled,
      p.models.map((m) => [
        m.id,
        m.displayName,
        m.enabled,
        m.vision,
        m.sampling,
        m.providerOptions,
      ]),
    ]);
  return (access.providers as ProviderInstance[]).filter(
    (p) =>
      refs.some(
        (r) => r.providerId === p.id || r.compressProviderId === p.id,
      ) ||
      !expected.some(
        (candidate) =>
          candidate.id === p.id && signature(candidate) === signature(p),
      ),
  );
}
export function rememberModel(recent: string[], key: string) {
  return [key, ...recent.filter((entry) => entry !== key)].slice(0, 8);
}
export function visibleModelKeys(models: readonly LLMModel[]) {
  return new Set(models.filter((m) => m.available).map(llmModelSelection));
}
