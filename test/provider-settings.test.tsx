import React from "react";
import { jest } from "@jest/globals";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

for (const icon of [
  "add",
  "copy",
  "clear",
  "three-dots",
  "close",
  "eye",
  "eye-off",
  "down",
  "confirm",
  "cancel",
  "max",
  "min",
]) {
  jest.unstable_mockModule(`@/app/icons/${icon}.svg`, () => ({
    default: () => React.createElement("svg"),
  }));
}
const fetchModels = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const testConnection = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.unstable_mockModule("@/app/client/provider-http", () => ({
  fetchProviderModels: fetchModels,
}));
jest.unstable_mockModule("@/app/client/connection-test", () => ({
  testConnection,
}));
await import("../app/store/chat");
const ui = await import("../app/components/ui-lib");
jest.unstable_mockModule("@/app/components/ui-lib", () => ({
  ...ui,
  showToast: jest.fn(),
}));
const { ProviderSettings } =
  await import("../app/components/provider-settings");
const { useAccessStore } = await import("../app/store/access");
const { useAppConfig } = await import("../app/store/config");
const { createProviderModel } = await import("../app/client/providers");
const { default: Locale } = await import("../app/locales");
const t = Locale.ModelServices;

beforeAll(() => {
  // jsdom does not expose the native structuredClone implementation.
  global.structuredClone ??= (value) => JSON.parse(JSON.stringify(value));
});
beforeEach(async () => {
  await Promise.all([
    useAccessStore.persist.rehydrate(),
    useAppConfig.persist.rehydrate(),
  ]);
  useAccessStore.setState({
    _hasHydrated: true,
    providers: [
      {
        id: "one",
        name: "Test relay",
        protocol: "openai-chat",
        baseUrl: "https://relay.test/v1",
        apiKey: "",
        headers: {},
        enabled: true,
        models: [createProviderModel("test-model")],
      },
    ],
    legacyConnections: {},
  });
  useAppConfig.setState({ _hasHydrated: true });
  fetchModels.mockReset();
  testConnection.mockReset();
});
afterEach(cleanup);
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount(entry = "/settings") {
  return render(
    <MemoryRouter
      initialEntries={[entry]}
      future={{ v7_startTransition: true }}
    >
      <ProviderSettings />
      <Location />
    </MemoryRouter>,
  );
}
function openRelay() {
  fireEvent.click(screen.getByRole("button", { name: /Test relay/ }));
  return screen.getByRole("dialog");
}
function openPlatforms() {
  fireEvent.click(screen.getByRole("button", { name: t.ChoosePlatform }));
  return screen.getByRole("dialog", { name: t.ChoosePlatform });
}
function choosePlatform(name: string) {
  const picker = openPlatforms();
  fireEvent.click(within(picker).getByRole("button", { name }));
}

test("lists providers inline and saves an edit without navigating", () => {
  mount();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const dialog = openRelay();
  fireEvent.change(within(dialog).getByLabelText(t.Name), {
    target: { value: "Renamed relay" },
  });
  expect(useAccessStore.getState().providers[0].name).toBe("Test relay");
  fireEvent.click(within(dialog).getByRole("button", { name: t.Save }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Renamed relay/ }),
  ).toBeInTheDocument();
  expect(useAccessStore.getState().providers[0].name).toBe("Renamed relay");
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/settings$/);
});

test("per-model parameters are edited in the provider dialog and limited to the protocol", () => {
  mount();
  const editor = openRelay();
  fireEvent.click(
    within(editor).getByRole("button", { name: `${t.Params} 1` }),
  );
  const params = screen.getAllByRole("dialog").at(-1)!;
  const custom = (title: string) =>
    within(params).getByLabelText(`${title} ${t.CustomValue}`);
  fireEvent.click(custom(Locale.Settings.Temperature.Title));
  fireEvent.click(custom(Locale.Settings.PresencePenalty.Title));
  fireEvent.change(within(params).getByLabelText(t.Reasoning.Title), {
    target: { value: "high" },
  });
  fireEvent.click(within(params).getByRole("button", { name: t.Save }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(useAccessStore.getState().providers[0].models[0].params).toEqual({});

  // Anthropic cannot send penalties, so switching protocol drops them on save.
  fireEvent.change(within(editor).getByLabelText(t.Protocol), {
    target: { value: "anthropic" },
  });
  fireEvent.click(within(editor).getByRole("button", { name: t.Save }));
  expect(useAccessStore.getState().providers[0].models[0].params).toEqual({
    temperature: 1,
    reasoning: "high",
  });
});

test("Escape uses the latest dirty state and closes only the top confirmation", async () => {
  mount();
  const dialog = openRelay();
  fireEvent.change(within(dialog).getByLabelText(t.Name), {
    target: { value: "Unsaved relay" },
  });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(await screen.findByText(t.Unsaved)).toBeInTheDocument();
  expect(screen.getAllByRole("dialog")).toHaveLength(2);
  await act(async () => {
    fireEvent.keyDown(window, { key: "Escape" });
  });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByLabelText(t.Name)).toHaveValue("Unsaved relay");
  fireEvent.click(within(dialog).getByRole("button", { name: t.Cancel }));
  const confirm = await screen.findByRole("button", {
    name: new RegExp(Locale.UI.Confirm),
  });
  await act(async () => {
    fireEvent.click(confirm);
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useAccessStore.getState().providers[0].name).toBe("Test relay");
  openRelay();
  expect(screen.getByLabelText(t.Name)).toHaveValue("Test relay");
});

test("validation errors keep the draft open", () => {
  mount();
  const dialog = openRelay();
  fireEvent.change(within(dialog).getByLabelText(t.Name), {
    target: { value: " " },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: t.Save }));
  expect(screen.getByRole("alert")).toHaveTextContent(t.NameRequired);
  expect(screen.getByLabelText(t.Name)).toHaveValue(" ");
  expect(useAccessStore.getState().providers[0].name).toBe("Test relay");
});

test("creates and duplicates providers in the editor", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(t.Add) }));
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText(t.Protocol)).toHaveValue("openai-chat");
  expect(within(dialog).getByLabelText(t.Name)).toHaveValue("");
  expect(within(dialog).getByLabelText(t.Endpoint)).toHaveValue("");
  expect(within(dialog).getByLabelText(t.Key)).toHaveValue("");
  expect(within(dialog).getByLabelText(t.Enabled)).toBeChecked();
  expect(
    within(dialog).queryByDisplayValue("deepseek-flash"),
  ).not.toBeInTheDocument();
  choosePlatform("DeepSeek");
  expect(within(dialog).getByLabelText(t.Name)).toHaveValue("DeepSeek");
  expect(useAccessStore.getState().providers).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole("button", { name: t.Save }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useAccessStore.getState().providers).toHaveLength(2);
  expect(useAccessStore.getState().providers[1]).toMatchObject({
    name: "DeepSeek",
    protocol: "openai-chat",
    baseUrl: "https://api.deepseek.com/v1",
    models: [],
  });
  dialog = openRelay();
  fireEvent.click(within(dialog).getByRole("button", { name: t.Copy }));
  dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText(t.Name)).toHaveValue(
    `Test relay ${t.CopySuffix}`,
  );
  expect(within(dialog).getByRole("button", { name: t.Test })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: t.Save }));
  expect(useAccessStore.getState().providers).toHaveLength(3);
  expect(
    new Set(useAccessStore.getState().providers.map((p) => p.id)).size,
  ).toBe(3);
});

test("updates an API key from the provider editor", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(t.Add) }));
  const dialog = screen.getByRole("dialog");
  const key = within(dialog).getByLabelText(t.Key);
  fireEvent.change(key, { target: { value: "sk-test-key" } });
  expect(key).toHaveValue("sk-test-key");
});

test("platform selection fills name, protocol and URL while preserving credentials and models", () => {
  mount();
  act(() => {
    useAccessStore.setState({
      providers: useAccessStore
        .getState()
        .providers.map((p) => ({ ...p, enabled: false })),
    });
  });
  const editor = openRelay();
  fireEvent.change(within(editor).getByLabelText(t.Key), {
    target: { value: "keep-my-key" },
  });
  fireEvent.change(within(editor).getByLabelText(t.Protocol), {
    target: { value: "google" },
  });
  choosePlatform("AiHubMix");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(within(editor).getByLabelText(t.Name)).toHaveValue("AiHubMix");
  expect(within(editor).getByLabelText(t.Key)).toHaveValue("keep-my-key");
  expect(within(editor).getByLabelText(t.Protocol)).toHaveValue("openai-chat");
  expect(within(editor).getByLabelText(t.Endpoint)).toHaveValue(
    "https://aihubmix.com/v1",
  );
  expect(within(editor).getByLabelText(`${t.ModelId} 1`)).toHaveValue(
    "test-model",
  );
  expect(useAccessStore.getState().providers[0].baseUrl).toBe(
    "https://relay.test/v1",
  );
  expect(within(editor).getByLabelText(t.Enabled)).not.toBeChecked();
  expect(useAccessStore.getState().providers[0].name).toBe("Test relay");
  expect(useAccessStore.getState().providers[0].protocol).toBe("openai-chat");
  fireEvent.click(within(editor).getByRole("button", { name: t.Save }));
  expect(useAccessStore.getState().providers[0]).toMatchObject({
    name: "AiHubMix",
    protocol: "openai-chat",
    enabled: false,
    apiKey: "keep-my-key",
    baseUrl: "https://aihubmix.com/v1",
  });
  expect(useAccessStore.getState().providers[0]).not.toHaveProperty(
    "platformSelection",
  );
  // Reopening does not infer a platform association from the persisted URL.
  fireEvent.click(screen.getByRole("button", { name: /AiHubMix/ }));
  const reopened = screen.getByRole("dialog");
  fireEvent.change(within(reopened).getByLabelText(t.Protocol), {
    target: { value: "google" },
  });
  expect(within(reopened).getByLabelText(t.Endpoint)).toHaveValue(
    "https://aihubmix.com/v1",
  );
});

test("platform filtering supports names, Chinese aliases, URLs, case and whitespace", () => {
  mount();
  openRelay();
  const picker = openPlatforms();
  const search = within(picker).getByRole("searchbox", {
    name: t.SearchPlatforms,
  });
  expect(search).toHaveFocus();
  for (const query of ["  SILICONflow  ", "硅基流动", "api.siliconflow.cn"]) {
    fireEvent.change(search, { target: { value: query } });
    expect(
      within(picker)
        .getAllByRole("button")
        .filter((b) => b.textContent?.includes("SiliconFlow")),
    ).toHaveLength(1);
    expect(
      within(picker).getByRole("button", { name: "SiliconFlow" }),
    ).toBeEnabled();
    expect(
      within(picker).queryByRole("button", { name: "OpenAI" }),
    ).not.toBeInTheDocument();
  }
  fireEvent.change(search, { target: { value: "no-such-platform" } });
  expect(within(picker).getByRole("status")).toHaveTextContent(
    t.NoMatchingPlatforms,
  );
  fireEvent.change(search, { target: { value: "" } });
  expect(
    within(picker).getByRole("button", { name: "OpenAI" }),
  ).toBeInTheDocument();
});

test.each([
  ["DeepSeek", "openai-chat", "https://api.deepseek.com/v1"],
  ["Anthropic", "anthropic", "https://api.anthropic.com/v1"],
  ["Gemini", "google", "https://generativelanguage.googleapis.com/v1beta"],
  ["OpenAI", "openai-chat", "https://api.openai.com/v1"],
])(
  "selecting %s replaces all three fields regardless of the current protocol",
  (name, protocol, baseUrl) => {
    mount();
    const editor = openRelay();
    fireEvent.change(within(editor).getByLabelText(t.Protocol), {
      target: { value: "openai-responses" },
    });
    const picker = openPlatforms();
    const option = within(picker).getByRole("button", { name });
    expect(option).toBeEnabled();
    expect(within(option.closest("tr")!).getByText(baseUrl)).toHaveAttribute(
      "title",
      baseUrl,
    );
    expect(option.textContent).toBe(name);
    expect(option).toHaveAttribute("title", name);
    fireEvent.click(option);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(editor).getByLabelText(t.Name)).toHaveValue(name);
    expect(within(editor).getByLabelText(t.Protocol)).toHaveValue(protocol);
    expect(within(editor).getByLabelText(t.Endpoint)).toHaveValue(baseUrl);
  },
);

test("reselecting a platform replaces manual fields and cancel discards all three changes", async () => {
  mount();
  const editor = openRelay();
  choosePlatform("Gemini");
  fireEvent.change(within(editor).getByLabelText(t.Name), {
    target: { value: "My custom name" },
  });
  fireEvent.change(within(editor).getByLabelText(t.Endpoint), {
    target: { value: "https://custom.test/prefix" },
  });
  choosePlatform("DeepSeek");
  expect(within(editor).getByLabelText(t.Name)).toHaveValue("DeepSeek");
  expect(within(editor).getByLabelText(t.Protocol)).toHaveValue("openai-chat");
  expect(within(editor).getByLabelText(t.Endpoint)).toHaveValue(
    "https://api.deepseek.com/v1",
  );
  fireEvent.change(within(editor).getByLabelText(t.Name), {
    target: { value: "Personal DeepSeek" },
  });
  expect(within(editor).getByLabelText(t.Name)).toHaveValue(
    "Personal DeepSeek",
  );
  fireEvent.click(within(editor).getByRole("button", { name: t.Cancel }));
  await act(async () => {
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(Locale.UI.Confirm),
      }),
    );
  });
  expect(useAccessStore.getState().providers[0]).toMatchObject({
    name: "Test relay",
    protocol: "openai-chat",
    baseUrl: "https://relay.test/v1",
  });
});

test("protocol changes follow selected platform URLs until the URL is manually edited", () => {
  mount();
  const editor = openRelay();
  const protocol = within(editor).getByLabelText(t.Protocol);
  const endpoint = within(editor).getByLabelText(t.Endpoint);
  choosePlatform("AiHubMix");
  fireEvent.change(protocol, { target: { value: "google" } });
  expect(endpoint).toHaveValue("https://aihubmix.com/gemini/v1beta");
  fireEvent.change(protocol, { target: { value: "anthropic" } });
  expect(endpoint).toHaveValue("https://aihubmix.com/v1");
  fireEvent.change(protocol, { target: { value: "openai-responses" } });
  expect(endpoint).toHaveValue("https://aihubmix.com/v1");
  fireEvent.change(endpoint, {
    target: { value: "https://custom.test/my-prefix" },
  });
  fireEvent.change(protocol, { target: { value: "google" } });
  expect(endpoint).toHaveValue("https://custom.test/my-prefix");
  choosePlatform("AiHubMix");
  expect(protocol).toHaveValue("openai-chat");
  expect(endpoint).toHaveValue("https://aihubmix.com/v1");
});

test("incompatible protocol changes keep the address and explain how to resolve it", () => {
  mount();
  const editor = openRelay();
  choosePlatform("DeepSeek");
  fireEvent.change(within(editor).getByLabelText(t.Protocol), {
    target: { value: "google" },
  });
  expect(within(editor).getByLabelText(t.Endpoint)).toHaveValue(
    "https://api.deepseek.com/v1",
  );
  expect(within(editor).getByText(t.PlatformProtocolHint)).toBeInTheDocument();
  fireEvent.change(within(editor).getByLabelText(t.Protocol), {
    target: { value: "anthropic" },
  });
  expect(within(editor).getByLabelText(t.Endpoint)).toHaveValue(
    "https://api.deepseek.com/anthropic/v1",
  );
  expect(
    within(editor).queryByText(t.PlatformProtocolHint),
  ).not.toBeInTheDocument();
});

test("closing the platform picker preserves the draft and reopening clears the search", async () => {
  mount();
  const editor = openRelay();
  fireEvent.change(within(editor).getByLabelText(t.Name), {
    target: { value: "Unsaved name" },
  });
  let picker = openPlatforms();
  fireEvent.change(within(picker).getByRole("searchbox"), {
    target: { value: "DeepSeek" },
  });
  await act(async () => {
    fireEvent.keyDown(window, { key: "Escape" });
  });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(within(editor).getByLabelText(t.Name)).toHaveValue("Unsaved name");
  expect(within(editor).getByLabelText(t.Endpoint)).toHaveValue(
    "https://relay.test/v1",
  );
  picker = openPlatforms();
  expect(within(picker).getByRole("searchbox")).toHaveValue("");
  fireEvent.click(within(picker).getByRole("button", { name: t.Cancel }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

test.each(["Escape", "Cancel"])(
  "new drafts discard edits without confirmation via %s",
  async (method) => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.Add) }));
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.Add) }));
    choosePlatform("OpenAI");
    fireEvent.change(screen.getByLabelText(t.Key), {
      target: { value: "unsaved-key" },
    });
    await act(async () => {
      if (method === "Escape") fireEvent.keyDown(window, { key: "Escape" });
      else fireEvent.click(screen.getByRole("button", { name: t.Cancel }));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useAccessStore.getState().providers).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.Add) }));
    expect(screen.getByLabelText(t.Name)).toHaveValue("");
    expect(screen.getByLabelText(t.Key)).toHaveValue("");
  },
);

test("new providers use the unified editor entry", () => {
  mount();
  expect(
    screen.queryByRole("button", { name: /其他提供商|Other providers/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(t.Add) }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: t.ChoosePlatform }),
  ).toBeInTheDocument();
});

test("deletes a provider after confirmation and closes the editor", async () => {
  mount();
  const dialog = openRelay();
  fireEvent.click(within(dialog).getByRole("button", { name: t.Delete }));
  const confirm = await screen.findByRole("button", {
    name: new RegExp(Locale.UI.Confirm),
  });
  await act(async () => {
    fireEvent.click(confirm);
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useAccessStore.getState().providers).toHaveLength(0);
});

test("connection links open once and normal edits leave the URL alone", async () => {
  mount("/settings?connection=sdk%3Aone&other=keep");
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent(
    "/settings?other=keep",
  );
  await act(async () => {
    fireEvent.keyDown(window, { key: "Escape" });
  });
  act(() =>
    useAccessStore.getState().update((state) => {
      state.providers[0].name = "External update";
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("closing the editor ignores late model fetches", async () => {
  let resolve!: (models: unknown[]) => void;
  fetchModels.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  let dialog = openRelay();
  fireEvent.click(within(dialog).getByRole("button", { name: t.Fetch }));
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: t.Cancel }));
  });
  dialog = openRelay();
  await act(async () => {
    resolve([createProviderModel("late-model")]);
  });
  expect(
    within(dialog).queryByDisplayValue("late-model"),
  ).not.toBeInTheDocument();
  expect(useAccessStore.getState().providers[0].models).toHaveLength(1);
});

test("closing the editor aborts an outstanding connection test", async () => {
  let signal!: AbortSignal;
  testConnection.mockImplementation((...args) => {
    signal = args[2] as AbortSignal;
    return new Promise(() => {});
  });
  mount();
  const dialog = openRelay();
  fireEvent.click(within(dialog).getByRole("button", { name: t.Test }));
  expect(signal.aborted).toBe(false);
  await act(async () => {
    fireEvent.keyDown(window, { key: "Escape" });
  });
  expect(signal.aborted).toBe(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
