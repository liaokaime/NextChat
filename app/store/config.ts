import { LLMModel } from "../client/api";
import { DalleQuality, DalleStyle, ModelSize } from "../typing";
import { getClientConfig } from "../config/client";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  SUMMARIZE_MODEL,
  DEFAULT_SIDEBAR_WIDTH,
  StoreKey,
  ServiceProvider,
} from "../constant";
import { createPersistStore } from "../utils/store";
import { mergeBuiltinModels } from "../utils/builtin-models";

export type ModelType = (typeof DEFAULT_MODELS)[number]["name"];

export enum SubmitKey {
  Enter = "Enter",
  CtrlEnter = "Ctrl + Enter",
  ShiftEnter = "Shift + Enter",
  AltEnter = "Alt + Enter",
  MetaEnter = "Meta + Enter",
}

export enum Theme {
  Auto = "auto",
  Dark = "dark",
  Light = "light",
}

// Estimated token length at which unsummarized chat history is compacted.
// Keep this aligned with the model context size selected by the application.
export const DEFAULT_COMPRESS_MESSAGE_LENGTH_THRESHOLD = 192000;
export const DEFAULT_HISTORY_MESSAGE_COUNT = 16;

const config = getClientConfig();

export const DEFAULT_CONFIG = {
  lastUpdate: Date.now(), // timestamp, to merge state

  submitKey: SubmitKey.Enter,
  avatar: "1f603",
  fontSize: 14,
  fontFamily: "",
  theme: Theme.Auto as Theme,
  tightBorder: !!config?.isApp,
  sendPreviewBubble: true,
  enableAutoGenerateTitle: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,

  enableArtifacts: true, // show artifacts config

  enableCodeFold: true, // code fold config

  disablePromptHint: false,

  dontShowMaskSplashScreen: false, // dont show splash screen when create chat

  customModels: "",
  modelPicker: { favorites: [] as string[], recent: [] as string[] },
  models: DEFAULT_MODELS as any as LLMModel[],

  modelConfig: {
    model: SUMMARIZE_MODEL as ModelType,
    providerName: "OpenAI" as ServiceProvider,
    providerId: undefined as string | undefined,
    temperature: 0.5,
    top_p: 1,
    max_tokens: 4000,
    presence_penalty: 0,
    frequency_penalty: 0,
    sendMemory: true,
    historyMessageCount: DEFAULT_HISTORY_MESSAGE_COUNT,
    compressMessageLengthThreshold:
      DEFAULT_COMPRESS_MESSAGE_LENGTH_THRESHOLD,
    compressModel: "",
    compressProviderName: "",
    compressProviderId: undefined as string | undefined,
    enableInjectSystemPrompts: true,
    template: config?.template ?? DEFAULT_INPUT_TEMPLATE,
    size: "1024x1024" as ModelSize,
    quality: "standard" as DalleQuality,
    style: "vivid" as DalleStyle,
  },
};

export type ChatConfig = typeof DEFAULT_CONFIG;

export type ModelConfig = ChatConfig["modelConfig"];

export function limitNumber(
  x: number,
  min: number,
  max: number,
  defaultValue: number,
) {
  if (isNaN(x)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, x));
}

export const ModalConfigValidator = {
  model(x: string) {
    return x as ModelType;
  },
  max_tokens(x: number) {
    return limitNumber(x, 0, 512000, 1024);
  },
  presence_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  frequency_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  temperature(x: number) {
    return limitNumber(x, 0, 2, 1);
  },
  top_p(x: number) {
    return limitNumber(x, 0, 1, 1);
  },
};

export const useAppConfig = createPersistStore(
  { ...DEFAULT_CONFIG },
  (set, get) => ({
    reset() {
      set(() => ({ ...DEFAULT_CONFIG }));
    },

    mergeModels(newModels: LLMModel[]) {
      if (!newModels || newModels.length === 0) {
        return;
      }

      const oldModels = get().models;
      const modelMap: Record<string, LLMModel> = {};

      for (const model of oldModels) {
        model.available = false;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      for (const model of newModels) {
        model.available = true;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      set(() => ({
        models: Object.values(modelMap),
      }));
    },

    allModels() {},
  }),
  {
    name: StoreKey.Config,
    version: 4.4,

    merge(persistedState, currentState) {
      const state = persistedState as ChatConfig | undefined;
      if (!state) return { ...currentState };
      const models = mergeBuiltinModels(currentState.models, state.models);
      return {
        ...currentState,
        ...state,
        models: models,
        modelPicker: {
          favorites: Array.isArray(state.modelPicker?.favorites)
            ? state.modelPicker.favorites.filter((k) => typeof k === "string")
            : [],
          recent: Array.isArray(state.modelPicker?.recent)
            ? state.modelPicker.recent
                .filter((k) => typeof k === "string")
                .slice(0, 8)
            : [],
        },
      };
    },

    migrate(persistedState, version) {
      const state = persistedState as ChatConfig;

      if (version < 3.4) {
        state.modelConfig.sendMemory = true;
        state.modelConfig.historyMessageCount = DEFAULT_HISTORY_MESSAGE_COUNT;
        state.modelConfig.compressMessageLengthThreshold =
          DEFAULT_COMPRESS_MESSAGE_LENGTH_THRESHOLD;
        state.modelConfig.frequency_penalty = 0;
        state.modelConfig.top_p = 1;
        state.modelConfig.template = DEFAULT_INPUT_TEMPLATE;
        state.dontShowMaskSplashScreen = false;
      }

      if (version < 3.5) {
        state.customModels = "claude,claude-100k";
      }

      if (version < 3.6) {
        state.modelConfig.enableInjectSystemPrompts = true;
      }

      if (version < 3.7) {
        state.enableAutoGenerateTitle = true;
      }

      if (version < 3.8) {
        state.lastUpdate = Date.now();
      }

      if (version < 3.9) {
        state.modelConfig.template =
          state.modelConfig.template !== DEFAULT_INPUT_TEMPLATE
            ? state.modelConfig.template
            : config?.template ?? DEFAULT_INPUT_TEMPLATE;
      }

      if (version < 4.1) {
        state.modelConfig.compressModel =
          DEFAULT_CONFIG.modelConfig.compressModel;
        state.modelConfig.compressProviderName =
          DEFAULT_CONFIG.modelConfig.compressProviderName;
      }

      // Move the old built-in threshold to the larger context default while
      // preserving users who explicitly chose another value.
      if (
        version < 4.2 &&
        state.modelConfig.compressMessageLengthThreshold === 1000
      ) {
        state.modelConfig.compressMessageLengthThreshold =
          DEFAULT_COMPRESS_MESSAGE_LENGTH_THRESHOLD;
      }

      // Move the old built-in recent-history count to the larger-context
      // default while preserving users who explicitly chose another value.
      if (version < 4.3 && state.modelConfig.historyMessageCount === 4) {
        state.modelConfig.historyMessageCount = DEFAULT_HISTORY_MESSAGE_COUNT;
      }

      // The previous context-sized default was 256K; move it to the safer
      // 192K budget while preserving other user-selected thresholds.
      if (
        version < 4.4 &&
        state.modelConfig.compressMessageLengthThreshold === 256000
      ) {
        state.modelConfig.compressMessageLengthThreshold =
          DEFAULT_COMPRESS_MESSAGE_LENGTH_THRESHOLD;
      }

      return state as any;
    },
  },
);
