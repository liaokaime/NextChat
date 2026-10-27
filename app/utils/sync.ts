import {
  ChatSession,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";
import { useMaskStore } from "../store/mask";
import { usePromptStore } from "../store/prompt";
import { StoreKey } from "../constant";
import { merge } from "./merge";
import {
  migrateLegacyProviders,
  normalizeProviders,
} from "../client/providers";
import { normalizeLegacyConnections } from "../client/connections";
import { stripRemovedProviderAccess } from "../client/removed-providers";
import { mergeBuiltinModels } from "./builtin-models";

type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];
type NonFunctionFields<T> = Pick<T, NonFunctionKeys<T>>;

export function getNonFunctionFileds<T extends object>(obj: T) {
  const ret: any = {};

  Object.entries(obj).map(([k, v]) => {
    if (typeof v !== "function") {
      ret[k] = v;
    }
  });

  return ret as NonFunctionFields<T>;
}

export type GetStoreState<T> = T extends { getState: () => infer U }
  ? NonFunctionFields<U>
  : never;

const LocalStateSetters = {
  [StoreKey.Chat]: useChatStore.setState,
  [StoreKey.Access]: useAccessStore.setState,
  [StoreKey.Config]: useAppConfig.setState,
  [StoreKey.Mask]: useMaskStore.setState,
  [StoreKey.Prompt]: usePromptStore.setState,
} as const;

const LocalStateGetters = {
  [StoreKey.Chat]: () => getNonFunctionFileds(useChatStore.getState()),
  [StoreKey.Access]: () => getNonFunctionFileds(useAccessStore.getState()),
  [StoreKey.Config]: () => getNonFunctionFileds(useAppConfig.getState()),
  [StoreKey.Mask]: () => getNonFunctionFileds(useMaskStore.getState()),
  [StoreKey.Prompt]: () => getNonFunctionFileds(usePromptStore.getState()),
} as const;

export type AppState = {
  [k in keyof typeof LocalStateGetters]: ReturnType<
    (typeof LocalStateGetters)[k]
  >;
};

type Merger<T extends keyof AppState, U = AppState[T]> = (
  localState: U,
  remoteState: U,
) => U;

type StateMerger = {
  [K in keyof AppState]: Merger<K>;
};

// we merge remote state to local state
const MergeStates: StateMerger = {
  [StoreKey.Chat]: (localState, remoteState) => {
    // merge sessions
    const localSessions: Record<string, ChatSession> = {};
    localState.sessions.forEach((s) => (localSessions[s.id] = s));

    remoteState.sessions.forEach((remoteSession) => {
      // skip empty chats
      if (remoteSession.messages.length === 0) return;

      const localSession = localSessions[remoteSession.id];
      if (!localSession) {
        // if remote session is new, just merge it
        localState.sessions.push(remoteSession);
      } else {
        // if both have the same session id, merge the messages
        const localMessageIds = new Set(localSession.messages.map((v) => v.id));
        remoteSession.messages.forEach((m) => {
          if (!localMessageIds.has(m.id)) {
            localSession.messages.push(m);
          }
        });

        // sort local messages with date field in asc order
        localSession.messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
      }
    });

    // sort local sessions with date field in desc order
    localState.sessions.sort(
      (a, b) =>
        new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
    );

    return localState;
  },
  [StoreKey.Prompt]: (localState, remoteState) => {
    localState.prompts = {
      ...remoteState.prompts,
      ...localState.prompts,
    };
    return localState;
  },
  [StoreKey.Mask]: (localState, remoteState) => {
    localState.masks = {
      ...remoteState.masks,
      ...localState.masks,
    };
    return localState;
  },
  [StoreKey.Config]: mergeWithUpdate<AppState[StoreKey.Config]>,
  [StoreKey.Access]: (local, remote) => ({
    ...mergeWithUpdate(local, remote),
    legacyConnections: JSON.parse(
      JSON.stringify(
        (local.lastUpdateTime >= remote.lastUpdateTime ? local : remote)
          .legacyConnections,
      ),
    ),
  }),
};

export function getLocalAppState() {
  const appState = Object.fromEntries(
    Object.entries(LocalStateGetters).map(([key, getter]) => {
      return [key, getter()];
    }),
  ) as AppState;

  return appState;
}

export function setLocalAppState(appState: AppState) {
  normalizeAppState(appState);
  Object.entries(LocalStateSetters).forEach(([key, setter]) => {
    setter(appState[key as keyof AppState]);
  });
}

export function mergeAppState(localState: AppState, remoteState: AppState) {
  normalizeAppState(localState);
  normalizeAppState(remoteState);
  Object.keys(localState).forEach(<T extends keyof AppState>(k: string) => {
    const key = k as T;
    const localStoreState = localState[key];
    const remoteStoreState = remoteState[key];
    Object.assign(
      localStoreState,
      MergeStates[key](localStoreState, remoteStoreState),
    );
  });

  return localState;
}

/**
 * Merge state with `lastUpdateTime`, older state will be override
 */
export function mergeWithUpdate<T extends { lastUpdateTime?: number }>(
  localState: T,
  remoteState: T,
) {
  const localUpdateTime = localState.lastUpdateTime ?? 0;
  const remoteUpdateTime = remoteState.lastUpdateTime ?? 1;

  const [older, newer] =
    localUpdateTime < remoteUpdateTime
      ? [localState, remoteState]
      : [remoteState, localState];
  const result = JSON.parse(JSON.stringify(older)) as T;
  merge(result, newer);
  return result;
}

export function normalizeAppState(appState: AppState) {
  const access = appState[StoreKey.Access];
  const config = appState[StoreKey.Config];
  if (!access || !config) throw new Error("备份缺少服务商或应用配置。");
  const cleanedAccess = stripRemovedProviderAccess(access);
  for (const key of Object.keys(access)) {
    if (!(key in cleanedAccess))
      delete (access as Record<string, unknown>)[key];
  }
  Object.assign(access, cleanedAccess);
  config.models = mergeBuiltinModels([], config.models || []);
  access.providers = Array.isArray(access.providers)
    ? normalizeProviders(access.providers)
    : migrateLegacyProviders(
        access,
        config.models || [],
        [config.customModels, access.customModels].filter(Boolean).join(","),
      );
  access.providerInstancesInitialized = true;
  access.legacyConnections = normalizeLegacyConnections(
    access.legacyConnections,
  );
  access.connectionManagerInitialized =
    access.connectionManagerInitialized === true;
  config.modelPicker = {
    favorites: Array.isArray(config.modelPicker?.favorites)
      ? config.modelPicker.favorites.filter((key) => typeof key === "string")
      : [],
    recent: Array.isArray(config.modelPicker?.recent)
      ? config.modelPicker.recent
          .filter((key) => typeof key === "string")
          .slice(0, 8)
      : [],
  };
  return appState;
}
