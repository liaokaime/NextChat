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
const { ProviderSettings } = await import(
  "../app/components/provider-settings"
);
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
  fireEvent.click(screen.getAllByRole("button", { name: "DeepSeek" })[0]);
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText(t.Name)).toHaveValue("DeepSeek");
  expect(useAccessStore.getState().providers).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole("button", { name: t.Save }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useAccessStore.getState().providers).toHaveLength(2);
  dialog = openRelay();
  fireEvent.click(within(dialog).getByRole("button", { name: t.Copy }));
  dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText(t.Name)).toHaveValue(
    `Test relay ${t.CopySuffix}`,
  );
  fireEvent.click(within(dialog).getByRole("button", { name: t.Save }));
  expect(useAccessStore.getState().providers).toHaveLength(3);
  expect(
    new Set(useAccessStore.getState().providers.map((p) => p.id)).size,
  ).toBe(3);
});

test("updates an API key from the provider editor", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(t.Add) }));
  fireEvent.click(screen.getAllByRole("button", { name: "OpenAI" })[0]);
  const dialog = screen.getByRole("dialog");
  const key = within(dialog).getByLabelText(t.Key);
  fireEvent.change(key, { target: { value: "sk-test-key" } });
  expect(key).toHaveValue("sk-test-key");
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
