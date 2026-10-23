import {
  createProviderModel,
  normalizeBaseUrl,
  type ProviderInstance,
  type ProviderModel,
} from "./providers";

export function providerHeaders(
  instance: ProviderInstance,
): Record<string, string> {
  const auth: Record<string, string> =
    instance.protocol === "anthropic"
      ? { "x-api-key": instance.apiKey, "anthropic-version": "2023-06-01" }
      : instance.protocol === "google"
      ? { "x-goog-api-key": instance.apiKey }
      : { Authorization: `Bearer ${instance.apiKey}` };
  const headers = new Headers(auth);
  Object.entries(instance.headers).forEach(([key, value]) =>
    headers.set(key, value),
  );
  return Object.fromEntries(headers.entries());
}

export async function fetchProviderModels(
  instance: ProviderInstance,
  transport: typeof fetch,
): Promise<ProviderModel[]> {
  const base = normalizeBaseUrl(instance.baseUrl);
  const headers = providerHeaders(instance);
  const models = new Map(instance.models.map((m) => [m.id, m]));
  let next = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    for (let page = 0; page < 100; page++) {
      const url = new URL(`${base}/models`);
      if (instance.protocol === "google") {
        url.searchParams.set("pageSize", "1000");
        if (next) url.searchParams.set("pageToken", next);
      } else if (instance.protocol === "anthropic" && next)
        url.searchParams.set("after_id", next);
      const response = await transport(url, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          `获取模型失败 (${response.status}): ${await response.text()}`,
        );
      const data = await response.json();
      const list = instance.protocol === "google" ? data.models : data.data;
      if (!Array.isArray(list))
        throw new Error("服务商未返回有效的模型列表，请手动添加模型。");
      for (const item of list) {
        const id =
          instance.protocol === "google"
            ? String(item.name || "").replace(/^models\//, "")
            : item.id;
        if (typeof id === "string" && id && !models.has(id)) {
          models.set(id, {
            ...createProviderModel(id),
            displayName: item.displayName || item.display_name || id,
          });
        }
      }
      const token =
        instance.protocol === "google"
          ? data.nextPageToken
          : instance.protocol === "anthropic" && data.has_more
          ? data.last_id
          : "";
      if (!token) return [...models.values()];
      if (next === token) throw new Error("服务商重复返回相同分页标记。");
      next = token;
    }
    throw new Error("模型列表分页过多，请手动添加模型。");
  } finally {
    clearTimeout(timer);
  }
}
