import { jest } from "@jest/globals";
import { watchTheme } from "../app/utils/theme";

test("auto mode follows system changes and cleans up its listener", () => {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: false, writable: true });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => media),
  });
  document.head.innerHTML = '<meta name="theme-color" content="">';
  const stop = watchTheme("auto");
  expect(document.documentElement.dataset.theme).toBe("light");
  Object.defineProperty(media, "matches", { value: true });
  media.dispatchEvent(new Event("change"));
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.querySelector("meta")!.content).toBe("#151515");
  stop();
  Object.defineProperty(media, "matches", { value: false });
  media.dispatchEvent(new Event("change"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  watchTheme("light")();
  media.dispatchEvent(new Event("change"));
  expect(document.documentElement.dataset.theme).toBe("light");
});
