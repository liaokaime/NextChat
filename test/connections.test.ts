/** @jest-environment node */
import { ServiceProvider } from "../app/constant";
import {
  connectionViews,
  desktopConnectionModels,
  legacyConfigured,
  normalizeLegacyConnections,
  pruneUnusedImportedProviders,
  referencesConnection,
  rememberModel,
  type ConnectionAccess,
} from "../app/client/connections";
import {
  createProviderModel,
  llmModelSelection,
  migrateLegacyProviders,
} from "../app/client/providers";
import type { LLMModel } from "../app/client/api";

const models: LLMModel[] = [
  {
    name: "same-model",
    displayName: "Same",
    available: true,
    sorted: 0,
    provider: {
      id: "openai",
      providerName: "OpenAI",
      providerType: "openai",
      sorted: 0,
    },
  },
];
const access = (): ConnectionAccess => ({
  providers: [],
  legacyConnections: {},
  openaiUrl: "https://relay.test",
  openaiApiKey: "old-key",
});

test("renaming a legacy connection changes its label without changing routing or saved model keys", () => {
  const state = access();
  const original = desktopConnectionModels(state, models)[0];
  state.legacyConnections.OpenAI = { name: "Company relay", enabled: true };
  const renamed = desktopConnectionModels(state, models)[0];
  expect(renamed.provider.connectionName).toBe("Company relay");
  expect(llmModelSelection(renamed)).toBe(llmModelSelection(original));
  expect(renamed.provider.providerName).toBe(ServiceProvider.OpenAI);
  state.legacyConnections.OpenAI.enabled = false;
  expect(desktopConnectionModels(state, models)[0].available).toBe(false);
});

test("duplicate model IDs on different connections stay distinct and hidden connections stay hidden", () => {
  const state = access();
  state.providers = migrateLegacyProviders(
    { ...state, providers: undefined },
    models,
  );
  const combined = desktopConnectionModels(state, models);
  expect(new Set(combined.map(llmModelSelection)).size).toBe(2);
  state.legacyConnections.OpenAI = {
    name: "Deleted",
    enabled: false,
    hidden: true,
  };
  expect(desktopConnectionModels(state, models)).toHaveLength(1);
  expect(connectionViews(state, models, ["OpenAI"])).toHaveLength(1);
});

test("same-named SDK and native connections have consistent distinct labels without changing identities", () => {
  const state = access();
  state.providers = migrateLegacyProviders(
    { ...state, providers: undefined },
    models,
  );
  state.providers[0].name = "Office";
  state.legacyConnections.OpenAI = { name: "Office", enabled: true };
  const combined = desktopConnectionModels(state, models);
  expect(combined.map((m) => m.provider.connectionName)).toEqual([
    "Office",
    "Office (2)",
  ]);
  expect(combined.map(llmModelSelection)).toEqual([
    expect.stringContaining("legacy-openai"),
    "same-model@OpenAI",
  ]);
});

test("untouched automatic copies are pruned only when no main or compression reference exists", () => {
  const state = access();
  state.providers = migrateLegacyProviders(
    { ...state, providers: undefined },
    models,
  );
  expect(pruneUnusedImportedProviders(state, models, "", [])).toEqual([]);
  expect(
    pruneUnusedImportedProviders(state, models, "", [
      { compressProviderId: "legacy-openai", compressModel: "same-model" },
    ]),
  ).toHaveLength(1);
  state.providers[0].models[0].sampling = true;
  expect(pruneUnusedImportedProviders(state, models, "", [])).toHaveLength(1);
});

test("keyless local endpoints and referenced unconfigured providers remain manageable", () => {
  expect(
    legacyConfigured(
      { useCustomConfig: true, openaiUrl: "http://localhost:11434/v1" },
      ServiceProvider.OpenAI,
    ),
  ).toBe(true);
  const state = { providers: [], legacyConnections: {} };
  expect(
    connectionViews(state, models, [ServiceProvider.Azure])[0],
  ).toMatchObject({ key: "legacy:Azure", service: "Azure" });
  expect(connectionViews(state, models)).toEqual([]);
});

test("native model overrides and metadata survive normalization and disable only their own connection", () => {
  const state = access();
  state.legacyConnections = normalizeLegacyConnections({
    OpenAI: {
      name: "Office",
      enabled: true,
      models: [
        { ...createProviderModel("private-model"), displayName: "Private" },
      ],
    },
    unknown: { name: "invalid" },
  });
  expect(Object.keys(state.legacyConnections)).toEqual(["OpenAI"]);
  expect(desktopConnectionModels(state, models).map((m) => m.name)).toEqual([
    "private-model",
  ]);
});

test("connection impact includes compression and recent models use stable keys with a bounded history", () => {
  expect(
    referencesConnection(
      {
        providerId: "chat",
        compressModel: "summary",
        compressProviderId: "summary",
      },
      { key: "sdk:summary" },
    ),
  ).toBe(true);
  expect(
    referencesConnection({ providerName: "Google" }, { key: "legacy:OpenAI" }),
  ).toBe(false);
  const recent = Array.from({ length: 9 }, (_, i) => `key-${i}`);
  expect(rememberModel(recent, "key-3")).toEqual([
    "key-3",
    "key-0",
    "key-1",
    "key-2",
    "key-4",
    "key-5",
    "key-6",
    "key-7",
  ]);
});
