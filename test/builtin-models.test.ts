import { DEFAULT_MODELS } from "../app/constant";
import { DEFAULT_CONFIG, useAppConfig } from "../app/store";
import { mergeBuiltinModels } from "../app/utils/builtin-models";
import { collectModels } from "../app/utils/model";
import removedModels from "../app/config/removed-builtin-models.json";

const old = {
  name: "gpt-4.5-preview",
  available: true,
  sorted: 0,
  provider: {
    id: "openai",
    providerName: "OpenAI",
    providerType: "openai",
    sorted: 1,
  },
};

test("no removed model is bundled, and the new default is available", () => {
  for (const model of DEFAULT_MODELS) {
    const removed =
      removedModels[model.provider.providerName as keyof typeof removedModels];
    expect(removed || []).not.toContain(model.name);
  }
  expect(
    DEFAULT_MODELS.some(
      (m) =>
        m.name === DEFAULT_CONFIG.modelConfig.model &&
        m.provider.providerName === DEFAULT_CONFIG.modelConfig.providerName,
    ),
  ).toBe(true);
});

test("rehydration removes obsolete cached defaults and deduplicates JSON provider objects", () => {
  const builtin = JSON.parse(JSON.stringify(DEFAULT_MODELS));
  const active = { ...builtin[0], available: false };
  const persisted = [old, active, { ...old, name: "my-server-model" }];
  const merge = useAppConfig.persist.getOptions().merge!;
  const result = merge({ models: persisted }, useAppConfig.getState());
  expect(result.models.some((m) => m.name === old.name)).toBe(false);
  expect(
    result.models.filter(
      (m) => m.name === active.name && m.provider.id === active.provider.id,
    ),
  ).toEqual([active]);
  expect(result.models.some((m) => m.name === "my-server-model")).toBe(true);
  expect(persisted).toEqual([old, active, { ...old, name: "my-server-model" }]);
});

test("explicit relay instances and opt-in custom model aliases remain usable", () => {
  const relay = {
    ...old,
    provider: { ...old.provider, id: "relay", providerType: "ai-sdk" },
  };
  expect(mergeBuiltinModels(DEFAULT_MODELS, [relay])).toContainEqual(relay);
  expect(
    collectModels(
      mergeBuiltinModels(DEFAULT_MODELS, [old]),
      "+gpt-4.5-preview@openai=My relay",
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: old.name,
        displayName: "My relay",
        available: true,
      }),
    ]),
  );
});
