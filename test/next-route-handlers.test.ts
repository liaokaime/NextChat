/** @jest-environment node */
import { jest } from "@jest/globals";
import { NextRequest } from "next/server";

let providers: typeof import("../app/api/[provider]/[...path]/route");
let upstash: typeof import("../app/api/upstash/[action]/[...key]/route");
let webdav: typeof import("../app/api/webdav/[...path]/route");
let config: typeof import("../app/api/config/route");
const environment = {
  CODE: "next16-route-code",
  BASE_URL: "https://upstream.example",
  OPENAI_API_KEY: "route-test-system-key",
  WHITE_WEBDAV_ENDPOINTS: "https://dav.example/backups/",
  CUSTOM_MODELS: "",
  HIDE_USER_API_KEY: "",
  OPENAI_ORG_ID: "",
};
const originalEnvironment = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);

beforeAll(async () => {
  Object.assign(process.env, environment);
  // Jest 29's VM module linker must finish shared imports before the next load.
  providers = await import("../app/api/[provider]/[...path]/route");
  upstash = await import("../app/api/upstash/[action]/[...key]/route");
  webdav = await import("../app/api/webdav/[...path]/route");
  config = await import("../app/api/config/route");
});

beforeEach(() => jest.mocked(fetch).mockReset());
afterAll(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const providerContext = (
  provider = "openai",
  path = ["v1", "chat", "completions"],
) => ({
  params: Promise.resolve({ provider, path }),
});

test("removed 302.AI proxy returns 404 without forwarding credentials", async () => {
  const req = new NextRequest("https://app.example/api/302ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer retired-key" },
    body: JSON.stringify({ model: "old-model" }),
  });
  const res = await providers.POST(req, providerContext("302ai"));
  expect(res.status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});

test("promise route params preserve upstream URL, authorization, body and streaming", async () => {
  const req = new NextRequest(
    "https://app.example/api/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: "Bearer route-test-user-key" },
      body: JSON.stringify({ model: "test-model", stream: true }),
    },
  );
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
      controller.enqueue(encoder.encode("data: first\n\n"));
    },
  });
  jest.mocked(fetch).mockResolvedValueOnce(
    new Response(body, {
      status: 202,
      headers: {
        "Content-Type": "text/event-stream",
        "www-authenticate": "secret",
        "content-encoding": "br",
      },
    }),
  );
  const response = await providers.POST(req, providerContext());
  expect(fetch).toHaveBeenCalledWith(
    "https://upstream.example/v1/chat/completions",
    expect.objectContaining({
      method: "POST",
      body: req.body,
      headers: expect.objectContaining({
        Authorization: "Bearer route-test-user-key",
      }),
    }),
  );
  expect(response.status).toBe(202);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("x-accel-buffering")).toBe("no");
  expect(response.headers.has("www-authenticate")).toBe(false);
  expect(response.headers.has("content-encoding")).toBe(false);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    "data: first\n\n",
  );
  stream.enqueue(encoder.encode("data: [DONE]\n\n"));
  stream.close();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    "data: [DONE]\n\n",
  );
  expect((await reader.read()).done).toBe(true);
});

test("provider routing keeps authentication and forbidden-path errors", async () => {
  const unauthorized = await providers.POST(
    new NextRequest("https://app.example/api/openai/v1/chat/completions", {
      method: "POST",
    }),
    providerContext(),
  );
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toMatchObject({
    error: true,
    msg: "empty access code",
  });
  const forbidden = await providers.GET(
    new NextRequest("https://app.example/api/openai/private"),
    providerContext("openai", ["private"]),
  );
  expect(forbidden.status).toBe(403);
  const unknown = await providers.GET(
    new NextRequest("https://app.example/api/unknown/test"),
    providerContext("unknown", ["test"]),
  );
  expect(unknown.status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});

test("provider proxy preserves upstream error status and body", async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(
      new Response('{"error":"rate limited"}', { status: 429 }),
    );
  const response = await providers.POST(
    new NextRequest("https://app.example/api/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer nk-next16-route-code" },
      body: "{}",
    }),
    providerContext(),
  );
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: "rate limited" });
  expect(jest.mocked(fetch).mock.calls[0][1]!.headers).toMatchObject({
    Authorization: "Bearer route-test-system-key",
  });
});

test("Upstash awaits params and forwards sync requests without buffering", async () => {
  const upstream = new Response('{"result":"backup"}', { status: 200 });
  jest.mocked(fetch).mockResolvedValueOnce(upstream);
  const response = await upstash.GET(
    new NextRequest(
      "https://app.example/api/upstash/get/backup?endpoint=https://test.upstash.io",
      {
        headers: { Authorization: "Bearer sync-token" },
      },
    ),
    { params: Promise.resolve({ action: "get", key: ["backup"] }) },
  );
  expect(response).toBe(upstream);
  expect(fetch).toHaveBeenCalledWith(
    "https://test.upstash.io/get/backup",
    expect.objectContaining({
      method: "GET",
      body: null,
      headers: { authorization: "Bearer sync-token" },
    }),
  );
});

test("Upstash retains endpoint/action validation and preflight", async () => {
  const context = {
    params: Promise.resolve({ action: "delete", key: ["backup"] }),
  };
  for (const endpoint of ["https://test.upstash.io", "https://other.example"]) {
    const response = await upstash.POST(
      new NextRequest(
        `https://app.example/api/upstash/delete/backup?endpoint=${endpoint}`,
        { method: "POST" },
      ),
      context,
    );
    expect(response.status).toBe(403);
  }
  expect(
    (
      await upstash.OPTIONS(
        new NextRequest("https://app.example/api/upstash/get/backup", {
          method: "OPTIONS",
        }),
        context,
      )
    ).status,
  ).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});

test("WebDAV awaits catch-all params and preserves sync auth, body and redirect handling", async () => {
  const req = new NextRequest(
    "https://app.example/api/webdav/chatgpt-next-web/backup.json?endpoint=https://dav.example/backups/",
    {
      method: "PUT",
      headers: { Authorization: "Basic sync-token" },
      body: "backup-data",
    },
  );
  const upstream = new Response(null, { status: 201 });
  jest.mocked(fetch).mockResolvedValueOnce(upstream);
  const response = await webdav.PUT(req, {
    params: Promise.resolve({ path: ["chatgpt-next-web", "backup.json"] }),
  });
  expect(response).toBe(upstream);
  expect(fetch).toHaveBeenCalledWith(
    "https://dav.example/backups/chatgpt-next-web/backup.json",
    expect.objectContaining({
      method: "PUT",
      body: req.body,
      redirect: "manual",
      headers: { authorization: "Basic sync-token" },
    }),
  );
});

test("WebDAV rejects invalid endpoints and backup paths", async () => {
  const invalidEndpoint = await webdav.GET(
    new NextRequest(
      "https://app.example/api/webdav/backup.json?endpoint=https://other.example",
    ),
    { params: Promise.resolve({ path: ["backup.json"] }) },
  );
  expect(invalidEndpoint.status).toBe(400);
  const invalidPath = await webdav.GET(
    new NextRequest(
      "https://app.example/api/webdav/private.json?endpoint=https://dav.example/backups/",
    ),
    { params: Promise.resolve({ path: ["private.json"] }) },
  );
  expect(invalidPath.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

test("public config exposes flags without server secrets", async () => {
  const response = await config.GET();
  const data = await response.json();
  expect(data.needCode).toBe(true);
  expect(JSON.stringify(data)).not.toContain("route-test-system-key");
  expect(data).not.toHaveProperty("apiKey");
  expect(data).not.toHaveProperty("codes");
});
