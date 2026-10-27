import {
  APICallError,
  Output,
  generateText,
  smoothStream,
  streamText,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ChatOptions } from "./api";
import { normalizeBaseUrl, type ProviderInstance } from "./providers";

function canFallbackToText(error: unknown) {
  // Only retry explicit format/schema incompatibilities, never auth, rate limits,
  // network failures or unrelated bad requests.
  return (
    APICallError.isInstance(error) &&
    [400, 422].includes(error.statusCode ?? 0) &&
    /(?:response_format|json_schema|structured.?output|response.?schema)/i.test(
      error.message,
    ) &&
    /(?:unsupported|not supported|not support|invalid|unknown|unrecognized)/i.test(
      error.message,
    )
  );
}

export function createSdkModel(
  instance: ProviderInstance,
  modelId: string,
  transport: typeof fetch,
) {
  const withHeaders: typeof fetch = (input, init) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    Object.entries(instance.headers).forEach(([key, value]) =>
      headers.set(key, value),
    );
    return transport(input, { ...init, headers });
  };
  const settings = {
    baseURL: normalizeBaseUrl(instance.baseUrl),
    apiKey: instance.apiKey,
    headers: instance.headers,
    fetch: withHeaders,
  };
  switch (instance.protocol) {
    case "openai-chat":
      return createOpenAICompatible({ ...settings, name: "relay" }).chatModel(
        modelId,
      );
    case "openai-responses":
      return createOpenAI(settings).responses(modelId);
    case "anthropic":
      return createAnthropic(settings)(modelId);
    case "google":
      return createGoogleGenerativeAI(settings)(modelId);
  }
}

export async function runSdkChat(
  instance: ProviderInstance,
  options: ChatOptions,
  transport: typeof fetch,
  resolveImage: (url: string) => Promise<string> = async (url) => url,
): Promise<void> {
  const controller = new AbortController();
  options.onController?.(controller);
  const model = instance.models.find((m) => m.id === options.config.model);
  if (!instance.enabled || !model?.enabled)
    throw new Error("服务商或模型已停用，请重新选择模型。");
  const messages: ModelMessage[] = [];
  for (const message of options.messages) {
    if (typeof message.content === "string") {
      messages.push({ role: message.role, content: message.content });
      continue;
    }
    const text = message.content
      .filter((p) => p.type === "text")
      .map((p) => p.text || "")
      .join("\n");
    if (message.role !== "user") {
      messages.push({ role: message.role, content: text });
      continue;
    }
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string | Uint8Array; mediaType?: string }
    > = [];
    for (const part of message.content) {
      if (part.type === "text")
        content.push({ type: "text", text: part.text || "" });
      else if (part.image_url?.url) {
        if (!model.vision)
          throw new Error("此模型未启用图片输入，请先在服务商设置中开启。");
        const image = await resolveImage(part.image_url.url);
        if (!image.startsWith("data:")) {
          // Fetch remote images through the same desktop transport, never SDK/global fetch.
          const response = await transport(image, {
            signal: controller.signal,
          });
          if (!response.ok)
            throw new Error(`图片读取失败 (${response.status})`);
          content.push({
            type: "image",
            image: new Uint8Array(await response.arrayBuffer()),
            mediaType: response.headers.get("content-type") || "image/jpeg",
          });
        } else content.push({ type: "image", image });
      }
    }
    messages.push({ role: "user", content });
  }
  let response: Response | undefined;
  const trackedFetch: typeof fetch = async (input, init) => {
    response = await transport(input, init);
    return response;
  };
  const settings = {
    model: createSdkModel(instance, model.id, trackedFetch),
    messages,
    abortSignal: controller.signal,
    maxRetries: 0,
    // Per-model settings from the provider editor; unset keys use provider defaults.
    ...model.params,
    providerOptions: model.providerOptions as Parameters<
      typeof streamText
    >[0]["providerOptions"],
  };
  if (options.outputTask === "title") {
    // Titles must also work with relays that do not support JSON output.
    const result = await generateText(settings);
    if (controller.signal.aborted)
      throw new DOMException("The operation was aborted.", "AbortError");
    if (result.finishReason !== "stop")
      throw new Error("响应未完整结束，请重试。");
    const title = z.string().trim().min(1).parse(result.text);
    if (!response) throw new Error("服务商未返回响应。");
    options.onFinish(title, response);
    return;
  }
  if (options.outputTask === "summary") {
    const field = options.outputTask;
    let value: string;
    try {
      const result = await generateText({
        ...settings,
        output: Output.object({
          schema: z.object({ [field]: z.string().trim().min(1) }),
        }),
      });
      if (result.finishReason !== "stop")
        throw new Error("响应未完整结束，请重试。");
      value = result.output[field];
    } catch (error) {
      if (controller.signal.aborted || !canFallbackToText(error)) throw error;
      const result = await generateText(settings);
      if (result.finishReason !== "stop")
        throw new Error("响应未完整结束，请重试。");
      value = z.string().trim().min(1).parse(result.text);
    }
    if (controller.signal.aborted)
      throw new DOMException("The operation was aborted.", "AbortError");
    if (!response) throw new Error("服务商未返回响应。");
    options.onFinish(value, response);
    return;
  }
  if (options.config.stream === false) {
    const result = await generateText(settings);
    if (controller.signal.aborted)
      throw new DOMException("The operation was aborted.", "AbortError");
    if (result.finishReason === "error" || result.finishReason === "other")
      throw new Error("响应未完整结束，请重试。");
    if (result.finishReason === "tool-calls")
      throw new Error("此实例暂不支持原生工具调用。");
    if (!response) throw new Error("服务商未返回响应。");
    if (result.reasoningText) options.onReasoning?.(result.reasoningText);
    options.onFinish(result.text, response);
    return;
  }
  const result = streamText({
    ...settings,
    experimental_transform: smoothStream({
      delayInMs: null,
      chunking:
        typeof Intl.Segmenter === "function"
          ? new Intl.Segmenter(undefined, { granularity: "word" })
          : (buffer) => Array.from(buffer)[0],
    }),
  });
  let text = "";
  let reasoning = "";
  for await (const part of result.fullStream) {
    if (part.type === "error")
      throw part.error instanceof Error
        ? part.error
        : new Error(String(part.error));
    if (part.type === "text-delta") {
      text += part.text;
      options.onUpdate?.(text, part.text);
    }
    if (part.type === "reasoning-delta") {
      reasoning += part.text;
      options.onReasoning?.(reasoning);
    }
  }
  // An explicit stop preserves partial text without starting title/summary requests.
  if (controller.signal.aborted)
    throw new DOMException("The operation was aborted.", "AbortError");
  const finishReason = await result.finishReason;
  if (finishReason === "error" || finishReason === "other")
    throw new Error("响应未完整结束，请重试。");
  if (finishReason === "tool-calls")
    throw new Error("此实例暂不支持原生工具调用。");
  if (!response) throw new Error("服务商未返回响应。");
  options.onFinish(text, response);
}
