/** @jest-environment node */
import {
  createProviderModel,
  instanceModels,
  llmModelSelection,
  migrateLegacyProviders,
  normalizeProviders,
  parseModelSelection,
  summaryTarget,
  type ProviderInstance,
} from "../app/client/providers";
import { fetchProviderModels } from "../app/client/provider-http";

const instance: ProviderInstance = {
  id: "relay-1",
  name: "同名中转",
  protocol: "openai-chat",
  baseUrl: "https://relay.test/v1",
  apiKey: "key",
  headers: {},
  enabled: true,
  models: [createProviderModel("model@alias")],
};

test("same display names and model aliases have distinct stable selections", () => {
  const models = instanceModels([instance, { ...instance, id: "relay-2" }]);
  expect(llmModelSelection(models[0])).not.toBe(llmModelSelection(models[1]));
  expect(parseModelSelection(llmModelSelection(models[1]))).toMatchObject({
    providerId: "relay-2",
    model: "model@alias",
  });
});

test("legacy migration preserves addresses, aliases and disabled models, and is idempotent", () => {
  const models = [
    {
      name: "old",
      available: true,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
        sorted: 0,
      },
      sorted: 0,
    },
  ];
  const migrated = migrateLegacyProviders(
    { openaiUrl: "https://relay.test", openaiApiKey: "key" },
    models,
    "-old,+alias@openai=自定义",
  );
  expect(migrated[0].baseUrl).toBe("https://relay.test/v1");
  expect(migrated[0].models).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "old", enabled: false }),
      expect.objectContaining({ id: "alias", displayName: "自定义" }),
    ]),
  );
  expect(migrateLegacyProviders({ providers: migrated }, models)).toEqual(
    migrated,
  );
  expect(migrateLegacyProviders({ providers: [] }, models)).toEqual([]);
  expect(
    migrateLegacyProviders(
      { googleUrl: "https://relay.test/v1", googleApiKey: "key" },
      [],
    )[0].baseUrl,
  ).toBe("https://relay.test/v1");
});

test("normalization preserves an existing instance across a JSON backup round trip", () => {
  expect(normalizeProviders(JSON.parse(JSON.stringify([instance])))).toEqual([
    instance,
  ]);
});

test("title and summary follow the selected relay unless explicitly overridden", () => {
  const config = {
    model: "gemini-any-alias",
    providerName: "中转",
    providerId: "relay",
    compressModel: "",
    compressProviderName: "",
  };
  expect(summaryTarget(config)).toEqual({
    model: config.model,
    providerName: "中转",
    providerId: "relay",
  });
  expect(
    summaryTarget({
      ...config,
      compressModel: "summary",
      compressProviderName: "另一个",
      compressProviderId: "second",
    }),
  ).toEqual({ model: "summary", providerName: "另一个", providerId: "second" });
});

test("fetching models keeps local settings and appends new remote models", async () => {
  const saved = {
    ...instance,
    models: [{ ...instance.models[0], enabled: false, vision: true }],
  };
  const models = await fetchProviderModels(
    saved,
    async () =>
      new Response(
        JSON.stringify({ data: [{ id: "model@alias" }, { id: "new" }] }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  expect(models[0]).toEqual(saved.models[0]);
  expect(models[1].id).toBe("new");
});
