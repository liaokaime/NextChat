import { jest } from "@jest/globals";

const isTauri = jest.fn(() => true);
const writeText = jest.fn<(text: string) => Promise<void>>();
const save = jest.fn<(options: unknown) => Promise<string | null>>();
const writeTextFile = jest.fn<(path: string, data: string) => Promise<void>>();
const showToast = jest.fn();

jest.unstable_mockModule("@tauri-apps/api/core", () => ({ isTauri }));
jest.unstable_mockModule("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText,
}));
jest.unstable_mockModule("@tauri-apps/plugin-dialog", () => ({ save }));
jest.unstable_mockModule("@tauri-apps/plugin-fs", () => ({ writeTextFile }));
jest.unstable_mockModule("@/app/components/ui-lib", () => ({ showToast }));
jest.unstable_mockModule("@/app/store", () => ({
  useAccessStore: { getState: () => ({}) },
}));

const { copyToClipboard, downloadAs } = await import("../app/utils");
const { default: Locale } = await import("../app/locales");

beforeEach(() => {
  isTauri.mockReset().mockReturnValue(true);
  writeText.mockReset().mockResolvedValue(undefined);
  save.mockReset();
  writeTextFile.mockReset().mockResolvedValue(undefined);
  showToast.mockClear();
});

test("copy success waits for the native clipboard write", async () => {
  let complete!: () => void;
  writeText.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const copying = copyToClipboard("copied text");
  expect(writeText).toHaveBeenCalledWith("copied text");
  expect(showToast).not.toHaveBeenCalled();
  complete();
  await copying;
  expect(showToast).toHaveBeenCalledWith(Locale.Copy.Success);
});

test("failed native copy uses the fallback and reports a failed fallback", async () => {
  writeText.mockRejectedValue(new Error("clipboard denied"));
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: jest.fn(() => false),
  });
  await copyToClipboard("copied text");
  expect(showToast).toHaveBeenCalledWith(Locale.Copy.Failed);
  expect(document.querySelector("textarea")).toBeNull();
  Reflect.deleteProperty(document, "execCommand");
});

test("exports Unicode text only to the path selected by the user", async () => {
  save.mockResolvedValue("C:/Users/test/中文目录/聊天.json");
  await downloadAs('{"聊天":"内容"}', "聊天.json");
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ defaultPath: "聊天.json" }),
  );
  expect(writeTextFile).toHaveBeenCalledWith(
    "C:/Users/test/中文目录/聊天.json",
    '{"聊天":"内容"}',
  );
  expect(showToast).toHaveBeenCalledWith(Locale.Download.Success);
});

test("cancelled save dialogs do not write files", async () => {
  save.mockResolvedValue(null);
  await downloadAs("contents", "chat.txt");
  expect(writeTextFile).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalledWith(Locale.Download.Success);
});

test.each(["dialog", "write"])(
  "%s failures report a failed download",
  async (step) => {
    if (step === "dialog") save.mockRejectedValue(new Error("dialog denied"));
    else {
      save.mockResolvedValue("C:/chat.txt");
      writeTextFile.mockRejectedValue(new Error("write denied"));
    }
    await expect(downloadAs("contents", "chat.txt")).resolves.toBeUndefined();
    expect(showToast).toHaveBeenCalledWith(Locale.Download.Failed);
  },
);

test("web downloads keep using the browser and do not invoke desktop plugins", async () => {
  isTauri.mockReturnValue(false);
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  try {
    await downloadAs("web contents", "chat.txt");
    expect(click).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
  } finally {
    click.mockRestore();
  }
});
