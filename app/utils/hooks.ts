import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";
import { desktopConnectionModels } from "../client/connections";
import { getClientConfig } from "../config/client";
import type { LLMModel } from "../client/api";

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
      ? desktopConnectionModels(accessStore, legacy as LLMModel[])
      : legacy;
  }, [accessStore, configStore.customModels, configStore.models]);

  return models;
}
