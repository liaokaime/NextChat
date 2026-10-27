import { jest } from "@jest/globals";
import { getClientApi } from "../app/client/api";
import { ChatGPTApi } from "../app/client/platforms/openai";
import { collectModels } from "../app/utils/model";
import { mergeBuiltinModels } from "../app/utils/builtin-models";
import { useAccessStore } from "../app/store/access";
import { ServiceProvider } from "../app/constant";
import type { LLMModel } from "../app/client/api";

test.each(["302.AI", "ai302", "302ai"])(
  "retired %s sessions fail without falling back to OpenAI",
  async (provider) => {
    const openai = jest.spyOn(ChatGPTApi.prototype, "chat");
    const onError = jest.fn();
    jest.mocked(fetch).mockClear();
    try {
      await getClientApi(provider as ServiceProvider).llm.chat({
        messages: [{ role: "user", content: "private conversation" }],
        config: { model: "old-model" },
        onError,
        onFinish: jest.fn(),
      });
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(openai).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      openai.mockRestore();
    }
  },
);

test("retired models cannot reappear through saved catalogs or custom model strings", () => {
  const model: LLMModel = {
    name: "old-model",
    available: true,
    sorted: 0,
    provider: {
      id: "ai302",
      providerName: "302.AI",
      providerType: "ai302",
      sorted: 0,
    },
  };
  expect(mergeBuiltinModels([], [model])).toEqual([]);
  expect(
    collectModels([model], "old-model@302.AI,keep@OpenAI").map((m) => m.name),
  ).toEqual(["keep"]);
});

test("access persistence merge drops retired credentials", () => {
  const original = useAccessStore.getState();
  const merge = useAccessStore.persist.getOptions().merge!;
  const result = merge(
    {
      ...original,
      ai302ApiKey: "retired-key",
      ai302Url: "https://api.302.ai",
      provider: "302.AI",
    },
    original,
  );
  expect(result).not.toHaveProperty("ai302ApiKey");
  expect(result).not.toHaveProperty("ai302Url");
  expect(result.provider).toBe(ServiceProvider.OpenAI);
});

test("upgrading access storage writes back the sanitized state", async () => {
  const original = useAccessStore.getState();
  const options = useAccessStore.persist.getOptions();
  const setItem = jest.fn();
  useAccessStore.persist.setOptions({
    storage: {
      getItem: () => ({
        version: 3,
        state: {
          ...original,
          ai302ApiKey: "retired-key",
          ai302Url: "https://api.302.ai",
          provider: "302.AI",
        } as unknown as typeof original,
      }),
      setItem,
      removeItem: jest.fn(),
    },
  });
  try {
    await useAccessStore.persist.rehydrate();
    expect(setItem).toHaveBeenCalled();
    const saved = setItem.mock.calls[0][1] as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(saved.version).toBe(4);
    expect(saved.state).not.toHaveProperty("ai302ApiKey");
    expect(saved.state).not.toHaveProperty("ai302Url");
  } finally {
    useAccessStore.setState(original, true);
    useAccessStore.persist.setOptions(options);
  }
});
