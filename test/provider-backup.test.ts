/** @jest-environment node */
import {
  getLocalAppState,
  mergeAppState,
  normalizeAppState,
  mergeWithUpdate,
} from "../app/utils/sync";
import { StoreKey } from "../app/constant";
import { createProviderModel } from "../app/client/providers";

const snapshot = () => JSON.parse(JSON.stringify(getLocalAppState()));

test("retired provider credentials are removed while conversations and custom connections survive", () => {
  const state = snapshot();
  const access = state[StoreKey.Access];
  access.provider = "302.AI";
  access.ai302ApiKey = "retired-secret";
  access.ai302Url = "https://api.302.ai";
  access.legacyConnections = {
    "302.AI": { name: "retired", enabled: true },
    OpenAI: { name: "keep", enabled: true },
  };
  const provider = {
    name: "302.AI",
    protocol: "openai-chat",
    apiKey: "retired-secret",
    headers: {},
    models: [createProviderModel("old-model")],
    enabled: true,
  };
  access.providers = [
    { ...provider, id: "legacy-ai302", baseUrl: "https://old.example/v1" },
    { ...provider, id: "platform-preset", baseUrl: "https://api.302.ai/v1" },
    { ...provider, id: "custom", baseUrl: "https://custom.example/v1", apiKey: "keep-key" },
  ];
  const selection = { model: "old-model", providerName: "302.AI" };
  state[StoreKey.Chat].sessions = [{
    id: "history",
    mask: { modelConfig: selection },
    messages: [{ role: "assistant", content: "saved reply" }],
  }];
  const history = JSON.stringify(state[StoreKey.Chat]);
  normalizeAppState(state);
  expect(access.ai302ApiKey).toBeUndefined();
  expect(access.ai302Url).toBeUndefined();
  expect(access.provider).toBe("OpenAI");
  expect(Object.keys(access.legacyConnections)).toEqual(["OpenAI"]);
  expect(access.providers).toEqual([expect.objectContaining({ id: "custom", apiKey: "keep-key" })]);
  expect(JSON.stringify(state[StoreKey.Chat])).toBe(history);
  expect(JSON.stringify(state)).not.toContain("retired-secret");
});

test("older backups never migrate the retired service into a new SDK connection", () => {
  const state = snapshot();
  const access = state[StoreKey.Access];
  delete access.providers;
  access.ai302ApiKey = "retired-secret";
  access.ai302Url = "https://api.302.ai";
  access.openaiApiKey = "keep-key";
  access.openaiUrl = "https://keep.example";
  normalizeAppState(state);
  expect(access.providers.map((p: { id: string }) => p.id)).not.toContain("legacy-ai302");
  expect(access.providers).toContainEqual(expect.objectContaining({ id: "legacy-openai", apiKey: "keep-key" }));
});

test("old backups migrate custom models and keys without altering historical routing", () => {
  const state = snapshot();
  delete state[StoreKey.Access].providers;
  state[StoreKey.Access].openaiUrl = "https://old.test";
  state[StoreKey.Access].openaiApiKey = "old-key";
  state[StoreKey.Config].models = [];
  state[StoreKey.Config].customModels = "my-model@openai=我的模型";
  state[StoreKey.Config].modelConfig.providerId = undefined;
  normalizeAppState(state);
  expect(state[StoreKey.Access].providers[0]).toMatchObject({
    baseUrl: "https://old.test/v1",
    apiKey: "old-key",
    models: [
      expect.objectContaining({ id: "my-model", displayName: "我的模型" }),
    ],
  });
  expect(state[StoreKey.Config].modelConfig.providerId).toBeUndefined();
  expect(normalizeAppState(snapshotRoundTrip(state))).toEqual(state);
});

function snapshotRoundTrip<T>(state: T): T {
  return JSON.parse(JSON.stringify(state));
}

test("sync replaces provider arrays from the newer backup without resurrecting deleted models or credentials", () => {
  const local = snapshot();
  const remote = snapshot();
  local[StoreKey.Access].providers = [
    {
      id: "old",
      name: "old",
      protocol: "openai-chat",
      baseUrl: "https://old.test/v1",
      apiKey: "old-key",
      headers: {},
      enabled: true,
      models: [createProviderModel("old-model")],
    },
  ];
  local[StoreKey.Access].lastUpdateTime = 1;
  remote[StoreKey.Access].providers = [
    {
      id: "new",
      name: "new",
      protocol: "openai-chat",
      baseUrl: "https://new.test/v1",
      apiKey: "new-key",
      headers: {},
      enabled: true,
      models: [createProviderModel("new-model")],
    },
  ];
  remote[StoreKey.Access].lastUpdateTime = 2;
  expect(
    mergeWithUpdate(local[StoreKey.Access], remote[StoreKey.Access]).providers,
  ).toEqual(remote[StoreKey.Access].providers);
  mergeAppState(local, remote);
  expect(local[StoreKey.Access].providers).toEqual(
    remote[StoreKey.Access].providers,
  );
  expect(JSON.stringify(local[StoreKey.Access].providers)).not.toContain(
    "old-key",
  );
  remote[StoreKey.Access].providers = [];
  remote[StoreKey.Access].lastUpdateTime = 3;
  mergeAppState(local, remote);
  expect(local[StoreKey.Access].providers).toEqual([]);
});

test("newer connection metadata replaces stale disabled connections and backup preferences round trip", () => {
  const local = snapshot();
  const remote = snapshot();
  local[StoreKey.Access].legacyConnections = {
    OpenAI: { name: "old", enabled: false, hidden: true },
  };
  local[StoreKey.Access].lastUpdateTime = 1;
  remote[StoreKey.Access].legacyConnections = {};
  remote[StoreKey.Access].lastUpdateTime = 2;
  remote[StoreKey.Config].modelPicker = {
    favorites: ['["id","model"]'],
    recent: ["model@Google"],
  };
  remote[StoreKey.Config].lastUpdateTime = 2;
  mergeAppState(local, remote);
  expect(local[StoreKey.Access].legacyConnections).toEqual({});
  expect(
    normalizeAppState(snapshotRoundTrip(remote))[StoreKey.Config].modelPicker,
  ).toEqual(remote[StoreKey.Config].modelPicker);
});
