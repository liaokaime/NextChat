/** @jest-environment node */
import { jest } from "@jest/globals";
import { runSdkChat } from "../app/client/sdk-chat";
import {
  createProviderModel,
  normalizeModelParams,
  normalizeProviders,
  type ModelParams,
  type ProviderInstance,
  type ProviderProtocol,
} from "../app/client/providers";
import type { ChatOptions } from "../app/client/api";

const answer = "你好，世界";
const thought = "先想一想";
function fixture(protocol: ProviderProtocol) {
  const events: unknown[] =
    protocol === "openai-chat"
      ? [
          { choices: [{ delta: { reasoning_content: thought } }] },
          { choices: [{ delta: { content: answer } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]
      : protocol === "google"
        ? [
            {
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [{ text: thought, thought: true }],
                  },
                },
              ],
            },
            {
              candidates: [
                {
                  content: { role: "model", parts: [{ text: answer }] },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 1,
                candidatesTokenCount: 2,
                totalTokenCount: 3,
              },
            },
          ]
        : protocol === "anthropic"
          ? [
              {
                type: "message_start",
                message: {
                  id: "msg",
                  model: "same-model",
                  role: "assistant",
                  usage: { input_tokens: 1 },
                },
              },
              {
                type: "content_block_start",
                index: 0,
                content_block: { type: "thinking", thinking: "" },
              },
              {
                type: "content_block_delta",
                index: 0,
                delta: { type: "thinking_delta", thinking: thought },
              },
              { type: "content_block_stop", index: 0 },
              {
                type: "content_block_start",
                index: 1,
                content_block: { type: "text", text: "" },
              },
              {
                type: "content_block_delta",
                index: 1,
                delta: { type: "text_delta", text: answer },
              },
              { type: "content_block_stop", index: 1 },
              {
                type: "message_delta",
                delta: { stop_reason: "end_turn" },
                usage: { output_tokens: 2 },
              },
              { type: "message_stop" },
            ]
          : [
              {
                type: "response.created",
                response: { id: "resp", created_at: 1, model: "same-model" },
              },
              {
                type: "response.output_item.added",
                output_index: 0,
                item: { type: "reasoning", id: "reason" },
              },
              {
                type: "response.reasoning_summary_text.delta",
                item_id: "reason",
                summary_index: 0,
                delta: thought,
              },
              {
                type: "response.output_item.done",
                output_index: 0,
                item: {
                  type: "reasoning",
                  id: "reason",
                  summary: [{ type: "summary_text", text: thought }],
                },
              },
              {
                type: "response.output_item.added",
                output_index: 1,
                item: { type: "message", id: "msg" },
              },
              {
                type: "response.output_text.delta",
                item_id: "msg",
                output_index: 1,
                delta: answer,
              },
              {
                type: "response.output_item.done",
                output_index: 1,
                item: {
                  type: "message",
                  id: "msg",
                  role: "assistant",
                  content: [
                    { type: "output_text", text: answer, annotations: [] },
                  ],
                },
              },
              {
                type: "response.completed",
                response: {
                  usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
                },
              },
            ];
  return (
    events
      .map(
        (event: any) =>
          `${
            protocol === "anthropic" ? `event: ${event.type}\n` : ""
          }data: ${JSON.stringify(event)}\n\n`,
      )
      .join("") + (protocol === "openai-chat" ? "data: [DONE]\n\n" : "")
  );
}

function streamResponse(body: string) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(
          bytes.slice(offset, (offset += Math.min(7, bytes.length - offset))),
        );
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function provider(protocol: ProviderProtocol, id = "one"): ProviderInstance {
  return {
    id,
    name: id,
    protocol,
    baseUrl: `https://${id}.test/v1`,
    apiKey: `secret-${id}`,
    headers: { "X-Route": id },
    enabled: true,
    models: [{ ...createProviderModel("same-model"), vision: true }],
  };
}
const protocols: ProviderProtocol[] = [
  "openai-chat",
  "openai-responses",
  "anthropic",
  "google",
];

describe.each(protocols)("SDK transport: %s", (protocol) => {
  test.each([undefined, "title"] as const)(
    "supports non-streaming requests with output task %s",
    async (outputTask) => {
      const body =
        protocol === "openai-chat"
          ? {
              id: "chat",
              created: 1,
              model: "same-model",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: answer,
                    reasoning_content: thought,
                  },
                  finish_reason: "stop",
                  index: 0,
                },
              ],
            }
          : protocol === "anthropic"
            ? {
                id: "msg",
                type: "message",
                role: "assistant",
                model: "same-model",
                content: [
                  {
                    type: "thinking",
                    thinking: thought,
                    signature: "signature",
                  },
                  { type: "text", text: answer },
                ],
                stop_reason: "end_turn",
                usage: { input_tokens: 1, output_tokens: 2 },
              }
            : protocol === "google"
              ? {
                  candidates: [
                    {
                      content: {
                        role: "model",
                        parts: [
                          { text: thought, thought: true },
                          { text: answer },
                        ],
                      },
                      finishReason: "STOP",
                    },
                  ],
                  usageMetadata: {
                    promptTokenCount: 1,
                    candidatesTokenCount: 2,
                    totalTokenCount: 3,
                  },
                }
              : {
                  id: "resp",
                  created_at: 1,
                  model: "same-model",
                  status: "completed",
                  output: [
                    {
                      type: "reasoning",
                      id: "reason",
                      summary: [{ type: "summary_text", text: thought }],
                    },
                    {
                      type: "message",
                      id: "msg",
                      role: "assistant",
                      content: [
                        { type: "output_text", text: answer, annotations: [] },
                      ],
                    },
                  ],
                  usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
                };
      const finish = jest.fn();
      const reasoning = jest.fn();
      await runSdkChat(
        provider(protocol),
        {
          messages: [{ role: "user", content: "title" }],
          config: { model: "same-model", stream: false },
          outputTask,
          onFinish: finish,
          onReasoning: reasoning,
        },
        async (input, init) => {
          const requestBody = JSON.parse(init?.body as string);
          expect(requestBody.stream).not.toBe(true);
          expect(requestBody.response_format).toBeUndefined();
          expect(requestBody.text?.format).toBeUndefined();
          expect(
            requestBody.generationConfig?.responseMimeType,
          ).toBeUndefined();
          expect(requestBody.output_config?.format).toBeUndefined();
          expect(String(input)).not.toContain("streamGenerateContent");
          return Response.json(body);
        },
      );
      expect(finish).toHaveBeenCalledTimes(1);
      expect(finish.mock.calls[0][0]).toBe(answer);
      if (outputTask) expect(reasoning).not.toHaveBeenCalled();
      else expect(reasoning).toHaveBeenLastCalledWith(thought);
    },
  );

  test("uses the explicit protocol, credentials and model, and separates fragmented reasoning from text", async () => {
    const requests: { url: string; headers: Headers; body: any }[] = [];
    const transport: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(init?.body as string),
      });
      return streamResponse(fixture(protocol));
    };
    const update = jest.fn();
    const reasoning = jest.fn();
    const finish = jest.fn();
    await runSdkChat(
      provider(protocol),
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "看图" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
              },
            ],
          },
        ],
        config: { model: "same-model", max_tokens: 100 },
        onUpdate: update,
        onReasoning: reasoning,
        onFinish: finish,
      },
      transport,
    );
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish.mock.calls[0][0]).toBe(answer);
    expect(reasoning).toHaveBeenLastCalledWith(thought);
    expect(update.mock.calls.at(-1)?.[0]).toBe(answer);
    expect(update.mock.calls.map(([, chunk]) => chunk).join("")).toBe(answer);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    const path =
      protocol === "openai-chat"
        ? "/chat/completions"
        : protocol === "openai-responses"
          ? "/responses"
          : protocol === "anthropic"
            ? "/messages"
            : "/models/same-model:streamGenerateContent";
    expect(new URL(request.url).pathname).toBe(`/v1${path}`);
    expect(request.headers.get("x-route")).toBe("one");
    expect(
      request.headers.get(
        protocol === "anthropic"
          ? "x-api-key"
          : protocol === "google"
            ? "x-goog-api-key"
            : "authorization",
      ),
    ).toBe(protocol.startsWith("openai") ? "Bearer secret-one" : "secret-one");
    expect(JSON.stringify(request.body)).toContain("iVBORw0KGgo=");
    expect(request.body.temperature).toBeUndefined();
  });

  test.each([401, 429])(
    "reports HTTP %i without retries or finishing",
    async (status) => {
      const transport = jest.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message: "bad key or rate limit",
                type: "api_error",
                code: status,
              },
            }),
            { status, headers: { "content-type": "application/json" } },
          ),
      );
      const finish = jest.fn();
      await expect(
        runSdkChat(
          provider(protocol),
          {
            messages: [{ role: "user", content: "hi" }],
            config: { model: "same-model" },
            onFinish: finish,
          },
          transport,
        ),
      ).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(finish).not.toHaveBeenCalled();
    },
  );
});

test.each([
  { content: "  ", reason: "stop" },
  { content: "Partial title", reason: "length" },
  { content: "", reason: "tool_calls" },
])(
  "rejects an empty or incomplete title ($reason)",
  async ({ content, reason }) => {
    const finish = jest.fn();
    const options: ChatOptions = {
      messages: [{ role: "user", content: "title" }],
      config: { model: "same-model", stream: false },
      outputTask: "title",
      onFinish: finish,
    };
    const transport = jest.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        id: "chat",
        created: 1,
        model: "same-model",
        choices: [
          {
            message: { role: "assistant", content },
            finish_reason: reason,
            index: 0,
          },
        ],
      }),
    );
    await expect(
      runSdkChat(provider("openai-chat"), options, transport),
    ).rejects.toThrow();
    expect(finish).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

test("validates auxiliary summary output with the SDK object schema", async () => {
  const finish = jest.fn();
  await runSdkChat(
    provider("openai-chat"),
    {
      messages: [{ role: "user", content: "summary" }],
      config: { model: "same-model", stream: false },
      outputTask: "summary",
      onFinish: finish,
    },
    async (_input, init) => {
      const requestBody = JSON.parse(init?.body as string);
      expect(requestBody.response_format).toBeDefined();
      return Response.json({
        id: "chat",
        created: 1,
        model: "same-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify({ summary: "A validated summary" }),
            },
            finish_reason: "stop",
            index: 0,
          },
        ],
      });
    },
  );
  expect(finish).toHaveBeenCalledTimes(1);
  expect(finish.mock.calls[0][0]).toBe("A validated summary");
});

test("same model in two instances never shares endpoint or credentials", async () => {
  const seen: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    seen.push(
      `${new URL(String(input)).hostname}:${new Headers(init?.headers).get(
        "authorization",
      )}`,
    );
    return streamResponse(fixture("openai-chat"));
  };
  await Promise.all(
    ["one", "two"].map((id) =>
      runSdkChat(
        provider("openai-chat", id),
        {
          messages: [
            {
              role: "assistant",
              content: "正文",
              reasoning: "不应重发",
            } as any,
            { role: "user", content: "继续" },
          ],
          config: { model: "same-model" },
          onFinish: () => {},
        },
        transport,
      ),
    ),
  );
  expect(seen.sort()).toEqual([
    "one.test:Bearer secret-one",
    "two.test:Bearer secret-two",
  ]);
});

describe("per-model generation parameters", () => {
  async function requestBody(params: ModelParams) {
    let body: any;
    const instance = provider("openai-chat");
    instance.models[0].params = params;
    await runSdkChat(
      instance,
      {
        messages: [{ role: "user", content: "hi" }],
        // Session-level values must not leak into SDK requests.
        config: {
          model: "same-model",
          temperature: 0.5,
          top_p: 0.9,
          presence_penalty: 0.3,
          frequency_penalty: 0.4,
          max_tokens: 100,
        },
        onFinish: () => {},
      },
      async (_input, init) => {
        body = JSON.parse(init?.body as string);
        return streamResponse(fixture("openai-chat"));
      },
    );
    return body;
  }

  test("leaves every parameter to the provider by default", async () => {
    const body = await requestBody({});
    for (const key of [
      "temperature",
      "top_p",
      "presence_penalty",
      "frequency_penalty",
      "max_tokens",
      "reasoning_effort",
    ])
      expect(body).not.toHaveProperty(key);
  });

  test("sends exactly the parameters set on the model", async () => {
    const body = await requestBody({
      temperature: 1.3,
      maxOutputTokens: 2048,
      reasoning: "high",
    });
    expect(body).toMatchObject({
      temperature: 1.3,
      max_tokens: 2048,
      reasoning_effort: "high",
    });
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("presence_penalty");
  });
});

test("stored parameters are validated and limited to the protocol", () => {
  const stored = {
    temperature: 1.5,
    topP: 3,
    presencePenalty: 0.5,
    maxOutputTokens: 10.5,
    reasoning: "provider-default",
  };
  expect(normalizeModelParams(stored, "google")).toEqual({
    temperature: 1.5,
    presencePenalty: 0.5,
  });
  expect(normalizeModelParams(stored, "anthropic")).toEqual({
    temperature: 1,
  });
  expect(normalizeModelParams({ reasoning: "max" }, "openai-chat")).toEqual({
    reasoning: "max",
  });
  const [legacy] = normalizeProviders([
    { ...provider("google"), models: [{ id: "old", sampling: true }] },
  ]);
  expect(legacy.models[0]).not.toHaveProperty("sampling");
  expect(legacy.models[0].params).toEqual({});
});
