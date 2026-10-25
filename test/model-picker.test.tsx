import React from "react";
import { jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";

// Next's Jest SVG stub is an image object; this app renders SVG imports as components.
jest.unstable_mockModule("../app/icons/down.svg", () => ({
  default: () => React.createElement("svg"),
}));
await import("../app/store/chat");
const { ModelPicker } = await import("../app/components/model-picker");
const { instanceModels, createProviderModel, llmModelSelection } = await import("../app/client/providers");
const { default: Locale } = await import("../app/locales");

const models = instanceModels([
  {
    id: "one",
    name: "First provider",
    protocol: "openai-chat",
    baseUrl: "https://one.test/v1",
    apiKey: "",
    headers: {},
    enabled: true,
    models: [createProviderModel("same")],
  },
  {
    id: "two",
    name: "Second provider",
    protocol: "openai-chat",
    baseUrl: "https://two.test/v1",
    apiKey: "",
    headers: {},
    enabled: true,
    models: [createProviderModel("same")],
  },
]);

test("native select distinguishes the same model on different providers without opening a dialog", () => {
  const onSelect = jest.fn();
  render(
    <ModelPicker
      current={llmModelSelection(models[0])}
      models={models}
      onSelect={onSelect}
    />,
  );
  const select = screen.getByRole("combobox");
  expect(select.tagName).toBe("SELECT");
  expect(
    screen.getByRole("option", { name: /First provider/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("option", { name: /Second provider/ }),
  ).toBeInTheDocument();
  fireEvent.change(select, { target: { value: llmModelSelection(models[1]) } });
  expect(onSelect).toHaveBeenCalledWith(models[1]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("unavailable choices remain visible and following the current model clears the override", () => {
  const onSelect = jest.fn();
  render(
    <ModelPicker
      current="missing@OpenAI"
      currentLabel="Old model"
      models={models}
      allowFollow
      onSelect={onSelect}
    />,
  );
  expect(screen.getByRole("option", { name: /Old model/ })).toBeDisabled();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "@" } });
  expect(onSelect).toHaveBeenCalledWith();
  expect(
    screen.getByRole("option", { name: Locale.ModelServices.Following }),
  ).toBeInTheDocument();
});
