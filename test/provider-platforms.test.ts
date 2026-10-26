/** @jest-environment node */
import { PROVIDER_PLATFORMS } from "../app/client/provider-platforms";
import { createSdkModel } from "../app/client/sdk-chat";
import {
  normalizeBaseUrl,
  type ProviderProtocol,
} from "../app/client/providers";

test.each<[string, ProviderProtocol, string]>([
  ["openai", "openai-chat", "https://api.openai.com/v1/chat/completions"],
  ["openai", "openai-responses", "https://api.openai.com/v1/responses"],
  ["anthropic", "anthropic", "https://api.anthropic.com/v1/messages"],
  [
    "gemini",
    "google",
    "https://generativelanguage.googleapis.com/v1beta/models/platform-test:generateContent",
  ],
  [
    "aihubmix",
    "google",
    "https://aihubmix.com/gemini/v1beta/models/platform-test:generateContent",
  ],
  [
    "dashscope",
    "openai-chat",
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  ],
  [
    "zhipu",
    "openai-chat",
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  ],
  [
    "doubao",
    "openai-chat",
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
  ],
  ["deepseek", "anthropic", "https://api.deepseek.com/anthropic/v1/messages"],
  ["groq", "openai-chat", "https://api.groq.com/openai/v1/chat/completions"],
  ["ppio", "openai-chat", "https://api.ppinfra.com/v3/openai/chat/completions"],
  ["perplexity", "openai-chat", "https://api.perplexity.ai/chat/completions"],
  ["ollama", "openai-chat", "http://localhost:11434/v1/chat/completions"],
  ["lmstudio", "openai-chat", "http://localhost:1234/v1/chat/completions"],
])("%s reaches the correct SDK %s endpoint", async (id, protocol, expected) => {
  const baseUrl = PROVIDER_PLATFORMS.find((platform) => platform.id === id)
    ?.baseUrls[protocol];
  expect(baseUrl).toBeDefined();
  let requestedUrl = "";
  // Intercept the SDK request locally; no platform traffic or real credentials.
  const transport: typeof fetch = async (input) => {
    requestedUrl = input instanceof Request ? input.url : String(input);
    return new Response(
      JSON.stringify({ error: { message: "test interception" } }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );
  };
  const model = createSdkModel(
    {
      id,
      name: id,
      protocol,
      baseUrl: baseUrl!,
      apiKey: "test-key",
      headers: {},
      models: [],
      enabled: true,
    },
    "platform-test",
    transport,
  );
  await expect(
    model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    }),
  ).rejects.toThrow();
  expect(requestedUrl).toBe(expected);
});

test("platform entries have unique IDs and normalized HTTP(S) SDK bases", () => {
  expect(new Set(PROVIDER_PLATFORMS.map((p) => p.id)).size).toBe(
    PROVIDER_PLATFORMS.length,
  );
  for (const platform of PROVIDER_PLATFORMS) {
    expect(platform.defaultProtocol).toBe(
      platform.baseUrls["openai-chat"]
        ? "openai-chat"
        : platform.id === "anthropic"
          ? "anthropic"
          : "google",
    );
    expect(platform.baseUrls[platform.defaultProtocol]).toBeTruthy();
    expect(Object.keys(platform.baseUrls).length).toBeGreaterThan(0);
    for (const url of Object.values(platform.baseUrls)) {
      expect(normalizeBaseUrl(url)).toBe(url);
      expect(new URL(url).pathname).not.toMatch(
        /\/(?:chat\/completions|messages|responses)$|\/v\d+(?:beta)?\/v\d/,
      );
    }
  }
});
