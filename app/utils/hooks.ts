import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";
import { instanceModels } from "../client/providers";
import { getClientConfig } from "../config/client";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  const models = useMemo(() => {
    const legacy = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    return getClientConfig()?.isApp
      ? [...instanceModels(accessStore.providers), ...legacy]
      : legacy;
  }, [
    accessStore.customModels,
    accessStore.defaultModel,
    configStore.customModels,
    configStore.models,
    accessStore.providers,
  ]);

  return models;
}
