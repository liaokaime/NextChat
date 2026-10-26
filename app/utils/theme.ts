/** Resolve automatic mode on the root so CSS variables and Tailwind agree. */
export function watchTheme(theme: "auto" | "light" | "dark") {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const resolved =
      theme === "auto" ? (media.matches ? "dark" : "light") : theme;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.classList.toggle("light", resolved === "light");
    document.documentElement.dataset.theme = resolved;
    const color = resolved === "dark" ? "#151515" : "#fafafa";
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", color));
  };
  apply();
  if (theme === "auto") media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}
