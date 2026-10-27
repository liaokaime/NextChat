// Historical identifiers are retained only to reject retired routes and clean
// saved credentials. Session/model selections stay intact for manual replacement.
export function isRemovedProvider(value?: string): boolean {
  return (
    typeof value === "string" &&
    ["302.ai", "ai302", "302ai"].includes(value.toLowerCase())
  );
}

export function isRemovedProviderInstance(
  id: string,
  baseUrl?: string,
): boolean {
  if (id === "legacy-ai302") return true;
  try {
    const hostname = new URL(baseUrl ?? "").hostname.toLowerCase();
    return hostname === "302.ai" || hostname.endsWith(".302.ai");
  } catch {
    return false;
  }
}

export function stripRemovedProviderAccess<T extends object>(value: T): T {
  const state = { ...value } as Record<string, unknown>;
  delete state.ai302ApiKey;
  delete state.ai302Url;
  if (isRemovedProvider(state.provider as string)) state.provider = "OpenAI";
  return state as T;
}
