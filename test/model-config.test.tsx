import React from "react";
import { jest } from "@jest/globals";
import { cleanup, render, screen } from "@testing-library/react";

for (const icon of [
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
await import("../app/store/chat");
const { ModelConfigList } = await import("../app/components/model-config");
const { ModelParamsEditor } = await import("../app/components/model-params");
const { DEFAULT_CONFIG } = await import("../app/store/config");
const { ServiceProvider } = await import("../app/constant");
const { default: Locale } = await import("../app/locales");
type ModelConfig = typeof DEFAULT_CONFIG.modelConfig;
const s = Locale.Settings;
const t = Locale.ModelServices;

function renderConfig(config: Partial<ModelConfig>) {
  render(
    <ModelConfigList
      modelConfig={{ ...DEFAULT_CONFIG.modelConfig, ...config }}
      updateConfig={() => {}}
    />,
  );
}

afterEach(cleanup);

test("settings point SDK models to the provider editor instead of sliders", () => {
  renderConfig({ providerId: "sdk", model: "model" });
  for (const title of [
    s.Temperature.Title,
    s.TopP.Title,
    s.MaxTokens.Title,
    s.PresencePenalty.Title,
  ])
    expect(screen.queryByText(title)).toBeNull();
  expect(screen.getByLabelText(s.InputTemplate.Title)).toBeInTheDocument();
});

test("legacy Google hides only penalties and keeps direct values", () => {
  renderConfig({ providerName: ServiceProvider.Google, model: "x" });
  expect(screen.getByLabelText(s.Temperature.Title)).toBeInTheDocument();
  expect(screen.getByLabelText(s.MaxTokens.Title)).toBeInTheDocument();
  expect(screen.queryByText(s.PresencePenalty.Title)).toBeNull();
  expect(screen.queryByText(s.SdkParams.Title)).toBeNull();
  expect(
    screen.getByLabelText(s.InjectSystemPrompts.Title),
  ).toBeInTheDocument();
});

test("parameter editor follows protocol support", () => {
  const { rerender } = render(
    <ModelParamsEditor
      protocol="anthropic"
      params={{ temperature: 0.7 }}
      onChange={() => {}}
    />,
  );
  expect(screen.getByLabelText(s.Temperature.Title)).toHaveAttribute(
    "max",
    "1",
  );
  expect(screen.getByText(t.TopPAnthropic)).toBeInTheDocument();
  expect(screen.queryByText(s.PresencePenalty.Title)).toBeNull();
  expect(screen.getByLabelText(t.Reasoning.Title)).toHaveValue(
    "provider-default",
  );

  rerender(
    <ModelParamsEditor protocol="google" params={{}} onChange={() => {}} />,
  );
  expect(screen.queryByLabelText(s.Temperature.Title)).toBeNull();
  expect(screen.getByText(s.FrequencyPenalty.Title)).toBeInTheDocument();
});
