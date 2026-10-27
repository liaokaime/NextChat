import type { LLMModel } from "../client/api";
import removedModels from "../config/removed-builtin-models.json";
import { isRemovedProvider } from "../client/removed-providers";

const removed = new Map(
  Object.entries(removedModels).map(([provider, names]) => [
    provider.toLowerCase(),
    new Set(names),
  ]),
);

// Remove only entries from the former bundled catalog. Explicit provider model
// lists and customModels are user data and are applied separately.
export function mergeBuiltinModels(
  builtin: readonly LLMModel[],
  persisted: readonly LLMModel[] = [],
): LLMModel[] {
  const key = (model: LLMModel) =>
    `${model.name}@${(
      model.provider?.id ||
      model.provider?.providerName ||
      ""
    ).toLowerCase()}`;
  const models = new Map(builtin.map((model) => [key(model), model]));
  for (const model of persisted) {
    const provider = model.provider;
    if (
      provider?.id === "legacy-ai302" ||
      (provider?.providerType !== "ai-sdk" &&
        isRemovedProvider(provider?.providerName || provider?.id))
    )
      continue;
    const names = removed.get(
      (provider?.providerName || provider?.id || "").toLowerCase(),
    );
    if (provider?.providerType !== "ai-sdk" && names?.has(model.name)) continue;
    models.set(key(model), model);
  }
  return [...models.values()];
}
