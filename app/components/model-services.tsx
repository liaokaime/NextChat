import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  UNSAFE_NavigationContext,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import Locale from "../locales";
import { ServiceProvider } from "../constant";
import { useAccessStore } from "../store/access";
import { useAppConfig } from "../store/config";
import { useChatStore } from "../store/chat";
import { useMaskStore } from "../store/mask";
import { collectModels } from "../utils/model";
import {
  connectionViews,
  legacyFields,
  referencesConnection,
  sdkKey,
  type ConnectionView,
} from "../client/connections";
import {
  createProviderModel,
  normalizeBaseUrl,
  normalizeModelParams,
  PROVIDER_PROTOCOLS,
  PROTOCOL_BASE_URLS,
  type ModelParams,
  type ProviderInstance,
  type ProviderModel,
  type ProviderProtocol,
} from "../client/providers";
import { fetchProviderModels } from "../client/provider-http";
import type { ProviderPlatform } from "../client/provider-platforms";
import { getClientApi, type LLMModel } from "../client/api";
import { testConnection } from "../client/connection-test";
import { fetch } from "../utils/stream";
import { installUnsavedNavigation } from "../utils/unsaved-navigation";
import { LegacyProviderFields } from "./legacy-provider-fields";
import { ModelParamsEditor } from "./model-params";
import { ProviderPlatformPicker } from "./provider-platform-picker";
import { IconButton } from "./button";
import {
  List,
  ListItem,
  Modal,
  PasswordInput,
  Select,
  showConfirm,
  showToast,
} from "./ui-lib";
import AddIcon from "../icons/add.svg";
import DeleteIcon from "../icons/clear.svg";
import ConnectionIcon from "../icons/connection.svg";
import styles from "./model-services.module.scss";

type ModelDraft = ProviderModel & { optionsText: string };
type Draft = {
  key: string;
  kind: "sdk" | "legacy";
  service?: ServiceProvider;
  id: string;
  name: string;
  enabled: boolean;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  models: ModelDraft[];
  values: Record<string, unknown>;
};
const modelDraft = (model: ProviderModel): ModelDraft => ({
  ...structuredClone(model),
  optionsText: JSON.stringify(model.providerOptions || {}, null, 2),
});
const newModelDraft = (model: ProviderModel): ModelDraft => ({
  ...modelDraft(model),
  vision: true,
  displayName: model.id.trim(),
});
function objectJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text || "{}");
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {
    /* Show a validation message below. */
  }
  throw new Error(Locale.ModelServices.InvalidJson);
}
function validateModels(models: ModelDraft[]) {
  const ids = new Set<string>();
  return models.map(({ optionsText, ...model }) => {
    const id = model.id.trim();
    if (!id || ids.has(id)) throw new Error(Locale.ModelServices.InvalidModels);
    ids.add(id);
    const options = objectJson(optionsText);
    if (
      Object.values(options).some(
        (v) => !v || typeof v !== "object" || Array.isArray(v),
      )
    )
      throw new Error(Locale.ModelServices.InvalidOptions);
    return {
      ...model,
      id,
      displayName: model.displayName.trim() || id,
      providerOptions: options as ProviderModel["providerOptions"],
    };
  });
}
function instanceFrom(draft: Draft): ProviderInstance {
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(draft.baseUrl);
  } catch {
    throw new Error(Locale.ModelServices.InvalidUrl);
  }
  return {
    id: draft.id,
    name: draft.name.trim(),
    enabled: draft.enabled,
    protocol: draft.protocol,
    baseUrl,
    apiKey: draft.apiKey,
    headers: {},
    // Drop parameters the (possibly changed) protocol cannot send.
    models: validateModels(draft.models).map((model) => ({
      ...model,
      params: normalizeModelParams(model.params, draft.protocol),
    })),
  };
}

function useUnsavedNavigation(dirty: boolean) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(
    () =>
      installUnsavedNavigation(navigator, dirtyRef, () =>
        showConfirm(Locale.ModelServices.Unsaved),
      ),
    [navigator],
  );
  return dirtyRef;
}

export function ModelServices() {
  const t = Locale.ModelServices;
  const access = useAccessStore(),
    config = useAppConfig(),
    chats = useChatStore(),
    masks = useMaskStore();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [selectedKey, setSelectedKey] = useState("");
  const initialConnection = useRef(params.get("connection"));
  const closing = useRef(false);
  const [draft, setDraft] = useState<Draft>();
  const [original, setOriginal] = useState("");
  const [platformPicker, setPlatformPicker] = useState(false);
  const [platformSelection, setPlatformSelection] = useState<{
    platform: ProviderPlatform;
    baseUrl: string;
  }>();
  const [optionsIndex, setOptionsIndex] = useState<number>();
  const [optionsParams, setOptionsParams] = useState<ModelParams>({});
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<ModelDraft[]>();
  const [fetchedSelection, setFetchedSelection] = useState<
    Record<string, boolean>
  >({});
  const [fetchedSearch, setFetchedSearch] = useState("");
  const [testModel, setTestModel] = useState("");
  const [test, setTest] = useState<{
    status: "idle" | "running" | "success" | "error";
    message?: string;
  }>({ status: "idle" });
  const testAbort = useRef<AbortController>();
  const fetchVersion = useRef(0);
  const dirty = !!draft && JSON.stringify(draft) !== original;
  const dirtyRef = useUnsavedNavigation(dirty);
  const visibleFetchedModels = useMemo(() => {
    const query = fetchedSearch.trim().toLowerCase();
    return (fetchedModels || []).filter((model) =>
      model.id.toLowerCase().includes(query),
    );
  }, [fetchedModels, fetchedSearch]);
  const legacyModels = useMemo(
    () =>
      collectModels(
        config.models,
        [config.customModels, access.customModels].join(","),
      ),
    [config.models, config.customModels, access.customModels],
  );
  const refs = useMemo(
    () => [
      config.modelConfig,
      ...chats.sessions.map((s) => s.mask.modelConfig),
      ...Object.values(masks.masks).map((m) => m.modelConfig),
    ],
    [config.modelConfig, chats.sessions, masks.masks],
  );
  const views = useMemo(
    () =>
      connectionViews(
        access,
        legacyModels as LLMModel[],
        refs.flatMap((r) => [
          ...(!r.providerId ? [r.providerName] : []),
          ...(r.compressModel && !r.compressProviderId
            ? [r.compressProviderName]
            : []),
        ]),
      ),
    [access, legacyModels, refs],
  );
  const selected = views.find((v) => v.key === selectedKey);
  const makeDraft = (view: ConnectionView): Draft => ({
    key: view.key,
    kind: view.kind,
    service: view.kind === "legacy" ? view.service : undefined,
    id: view.kind === "sdk" ? view.instance.id : view.key,
    name:
      view.kind === "sdk"
        ? view.instance.name
        : access.legacyConnections[view.service]?.name || view.service,
    enabled: view.enabled,
    protocol: view.kind === "sdk" ? view.instance.protocol : "openai-chat",
    baseUrl: view.baseUrl,
    apiKey: view.kind === "sdk" ? view.instance.apiKey : "",
    models: view.models.map(modelDraft),
    values:
      view.kind === "legacy"
        ? Object.fromEntries(
            legacyFields(view.service)
              .filter((key) => key in access)
              .map((key) => [key, access[key as keyof typeof access]]),
          )
        : {},
  });
  const load = (view: ConnectionView) => {
    const next = makeDraft(view);
    dirtyRef.current = false;
    setDraft(next);
    setOriginal(JSON.stringify(next));
    setSelectedKey(view.key);
    setError("");
    setFetching(false);
    setPlatformPicker(false);
    setPlatformSelection(undefined);
  };
  useEffect(() => {
    if (!access._hasHydrated || !config._hasHydrated) return;
    const key = initialConnection.current;
    if (!key) return;
    initialConnection.current = null;
    const view = views.find((v) => v.key === key);
    if (view) load(view);
    const nextParams = new URLSearchParams(params);
    nextParams.delete("connection");
    setParams(nextParams, { replace: true, state: location.state });
    // Only consume a connection link once, after persisted stores hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access._hasHydrated, config._hasHydrated, views]);
  const select = async (view: ConnectionView) => {
    if (dirty && !(await showConfirm(t.Unsaved))) return;
    fetchVersion.current++;
    load(view);
  };
  const edit = (update: (next: Draft) => void) => {
    fetchVersion.current++;
    setFetching(false);
    setDraft((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      update(next);
      return next;
    });
  };
  const affected = (view: Pick<ConnectionView, "key">) => {
    const sessions = chats.sessions.filter((s) =>
      referencesConnection(
        s.mask.syncGlobalConfig ? config.modelConfig : s.mask.modelConfig,
        view,
      ),
    ).length;
    const countMasks = Object.values(masks.masks).filter((m) =>
      referencesConnection(
        m.syncGlobalConfig ? config.modelConfig : m.modelConfig,
        view,
      ),
    ).length;
    const global = Number(referencesConnection(config.modelConfig, view));
    return {
      count: sessions + countMasks + global,
      text: t.Affected(sessions, countMasks, global),
    };
  };
  const closeEditor = () => {
    dirtyRef.current = false;
    fetchVersion.current++;
    testAbort.current?.abort();
    setFetching(false);
    setDraft(undefined);
    setSelectedKey("");
    setOriginal("");
    setError("");
    setOptionsIndex(undefined);
    setFetchedModels(undefined);
    setFetchedSelection({});
    setFetchedSearch("");
    setPlatformPicker(false);
    setPlatformSelection(undefined);
  };
  const requestClose = async () => {
    if (closing.current) return;
    closing.current = true;
    try {
      if (!selected || !dirtyRef.current || (await showConfirm(t.Unsaved)))
        closeEditor();
    } finally {
      closing.current = false;
    }
  };
  const save = async () => {
    if (!draft) return;
    try {
      if (!draft.name.trim()) throw new Error(t.NameRequired);
      const models = validateModels(draft.models);
      const instance = draft.kind === "sdk" ? instanceFrom(draft) : undefined;
      if (!draft.enabled && selected?.enabled) {
        const impact = affected(selected);
        if (
          impact.count &&
          !(await showConfirm(`${t.DisableConfirm}\n${impact.text}`))
        )
          return;
      }
      dirtyRef.current = false;
      access.update((state) => {
        if (instance) {
          const index = state.providers.findIndex((p) => p.id === instance.id);
          if (index < 0) state.providers.push(instance);
          else state.providers[index] = instance;
        } else if (draft.service) {
          for (const [key, value] of Object.entries(draft.values))
            Object.assign(state, { [key]: value });
          state.legacyConnections[draft.service] = {
            name: draft.name.trim(),
            enabled: draft.enabled,
            models,
            hidden: false,
          };
          state.useCustomConfig = true;
        }
        state.providerInstancesInitialized = true;
      });
      closeEditor();
      showToast(t.Saved);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (!selected) return;
    const impact = affected(selected);
    if (!(await showConfirm(`${t.DeleteConfirm}\n${impact.text}`))) return;
    dirtyRef.current = false;
    access.update((state) => {
      if (selected.kind === "sdk")
        state.providers = state.providers.filter(
          (p) => p.id !== selected.instance.id,
        );
      else {
        state.legacyConnections[selected.service] = {
          name: selected.name,
          enabled: false,
          hidden: true,
        };
        legacyFields(selected.service)
          .filter((key) => /(?:ApiKey|SecretKey|SecretId|ApiSecret)$/.test(key))
          .forEach((key) => Object.assign(state, { [key]: "" }));
      }
    });
    closeEditor();
  };
  const newDraft = (next: Draft) => {
    dirtyRef.current = false;
    fetchVersion.current++;
    setFetching(false);
    setDraft(next);
    setSelectedKey(next.key);
    setOriginal(JSON.stringify(next));
    setPlatformPicker(false);
    setPlatformSelection(undefined);
    setError("");
  };
  const beginSdk = () => {
    const id = nanoid();
    newDraft({
      key: sdkKey(id),
      kind: "sdk",
      id,
      name: "",
      enabled: true,
      protocol: "openai-chat",
      baseUrl: "",
      apiKey: "",
      models: [],
      values: {},
    });
  };
  useEffect(() => {
    testAbort.current?.abort();
    setTest({ status: "idle" });
    const enabled = draft?.models.filter((m) => m.enabled) || [];
    if (!enabled.some((m) => m.id === testModel))
      setTestModel(enabled[0]?.id || "");
    return () => testAbort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, testModel]);
  useEffect(
    () => () => {
      fetchVersion.current++;
    },
    [],
  );
  const runTest = async () => {
    if (!draft || !selected || dirty || !testModel || !draft.enabled) return;
    const controller = new AbortController();
    testAbort.current = controller;
    setTest({ status: "running" });
    try {
      const api = getClientApi(
        draft.service || ServiceProvider.OpenAI,
        draft.kind === "sdk" ? draft.id : undefined,
      );
      await testConnection(
        api.llm,
        {
          ...config.modelConfig,
          model: testModel,
          providerName: draft.service || draft.name,
          providerId: draft.kind === "sdk" ? draft.id : undefined,
        },
        controller.signal,
        { empty: t.EmptyResponse, timeout: t.Timeout },
      );
      if (!controller.signal.aborted) setTest({ status: "success" });
    } catch (e) {
      if (!controller.signal.aborted)
        setTest({ status: "error", message: (e as Error).message });
    }
  };
  const fetchModels = async () => {
    if (!draft || draft.kind !== "sdk") return;
    const version = ++fetchVersion.current;
    try {
      setError("");
      setFetching(true);
      const models = await fetchProviderModels(instanceFrom(draft), fetch);
      if (version !== fetchVersion.current) return;
      const existingIds = new Set(draft.models.map((model) => model.id));
      const fetched = models.map(modelDraft);
      setFetchedModels(fetched);
      setFetchedSearch("");
      setFetchedSelection(
        Object.fromEntries(
          fetched.map((model) => [model.id, existingIds.has(model.id)]),
        ),
      );
      showToast(t.Fetched);
    } catch (e) {
      if (version === fetchVersion.current) setError((e as Error).message);
    } finally {
      if (version === fetchVersion.current) setFetching(false);
    }
  };
  const addFetchedModels = () => {
    if (!fetchedModels?.length) {
      setFetchedModels(undefined);
      return;
    }
    const selectedIds = new Set(
      fetchedModels
        .filter((model) => fetchedSelection[model.id])
        .map((model) => model.id),
    );
    edit((next) => {
      const existingIds = new Set(next.models.map((model) => model.id));
      next.models.push(
        ...fetchedModels
          .filter(
            (model) => selectedIds.has(model.id) && !existingIds.has(model.id),
          )
          .map(newModelDraft),
      );
    });
    setFetchedModels(undefined);
    setFetchedSelection({});
  };
  const duplicate = () => {
    if (!draft || draft.kind !== "sdk") return;
    const id = nanoid();
    newDraft({
      ...structuredClone(draft),
      id,
      key: sdkKey(id),
      name: `${draft.name} ${t.CopySuffix}`,
    });
  };
  const selectPlatform = (platform: ProviderPlatform) => {
    const baseUrl = platform.baseUrls[platform.defaultProtocol];
    if (!draft || !baseUrl) return;
    edit((next) => {
      next.name = platform.name;
      next.protocol = platform.defaultProtocol;
      next.baseUrl = baseUrl;
    });
    setPlatformSelection({ platform, baseUrl });
    setPlatformPicker(false);
  };
  const changeProtocol = (protocol: ProviderProtocol) => {
    const baseUrl = platformSelection?.platform.baseUrls[protocol];
    const followsPlatform =
      !!platformSelection && draft?.baseUrl === platformSelection.baseUrl;
    edit((next) => {
      next.protocol = protocol;
      if (followsPlatform && baseUrl) next.baseUrl = baseUrl;
    });
    if (followsPlatform && baseUrl && platformSelection)
      setPlatformSelection({ ...platformSelection, baseUrl });
  };
  const openOptions = (index: number) => {
    setOptionsIndex(index);
    setOptionsParams(draft?.models[index]?.params || {});
    setOptionsText(draft?.models[index]?.optionsText || "{}");
  };
  const closeOptions = () => setOptionsIndex(undefined);
  const saveOptions = () => {
    if (optionsIndex === undefined) return;
    edit((next) => {
      next.models[optionsIndex].params = optionsParams;
      next.models[optionsIndex].optionsText = optionsText;
    });
    closeOptions();
  };
  return (
    <>
      <section className={styles.page} aria-label={t.Title}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>
              {t.Title} <span className={styles.count}>{views.length}</span>
            </h2>
            <p className={styles.subtitle}>{t.Subtitle}</p>
          </div>
          <div className={styles.actions}>
            <IconButton
              text={t.Add}
              icon={<AddIcon />}
              bordered
              onClick={beginSdk}
            />
          </div>
        </div>
        <div className={styles.connections} aria-label={t.Connections}>
          {!views.length && <p className={styles.empty}>{t.Empty}</p>}
          {views.map((view) => (
            <button
              key={view.key}
              className={styles.connection}
              aria-pressed={view.key === selectedKey}
              onClick={() => void select(view)}
            >
              <span className={styles.connectionTitle}>
                <span className={styles.connectionAvatar} aria-hidden="true">
                  {view.name.slice(0, 1).toUpperCase()}
                </span>
                <strong>{view.name}</strong>
              </span>
              <small>
                {(() => {
                  try {
                    return new URL(view.baseUrl).host;
                  } catch {
                    return view.baseUrl;
                  }
                })()}
              </small>
              <span
                className={styles.connectionStatus}
                data-enabled={view.enabled}
              >
                {view.enabled
                  ? t.Count(view.models.filter((m) => m.enabled).length)
                  : t.Disabled}
              </span>
            </button>
          ))}
        </div>
      </section>
      {draft &&
        createPortal(
          <div className="modal-mask">
            <Modal
              title={selected ? t.Edit : t.New}
              onClose={() => void requestClose()}
              footer={
                <div className={styles.feedback} aria-live="polite">
                  {selected && (
                    <IconButton
                      className={styles.footerButton}
                      text={t.Delete}
                      type="danger"
                      bordered
                      onClick={() => void remove()}
                    />
                  )}
                  {draft.kind === "sdk" && (
                    <IconButton
                      className={styles.footerButton}
                      text={t.Copy}
                      bordered
                      onClick={duplicate}
                    />
                  )}
                  {error && (
                    <p role="alert" className={styles.error}>
                      {error}
                    </p>
                  )}
                </div>
              }
              actions={[
                <IconButton
                  key="cancel"
                  className={`${styles.footerButton} ${styles.footerActionButton}`}
                  text={t.Cancel}
                  bordered
                  onClick={() => void requestClose()}
                />,
                <IconButton
                  key="save"
                  className={`${styles.footerButton} ${styles.footerActionButton}`}
                  text={t.Save}
                  type="primary"
                  disabled={!dirty && !!selected}
                  onClick={() => void save()}
                />,
              ]}
            >
              <div className={styles.editor}>
                <List>
                  <ListItem title={t.Name} className={styles.nameRow}>
                    <div className={styles.nameControls}>
                      {draft.kind === "sdk" && (
                        <IconButton
                          text={t.ChoosePlatform}
                          bordered
                          onClick={() => setPlatformPicker(true)}
                        />
                      )}
                      <input
                        type="text"
                        className={styles.wide}
                        aria-label={t.Name}
                        placeholder={t.NamePlaceholder}
                        value={draft.name}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          edit((next) => {
                            next.name = value;
                          });
                        }}
                      />
                    </div>
                  </ListItem>
                  {draft.kind === "sdk" && (
                    <ListItem title={t.Protocol}>
                      <Select
                        aria-label={t.Protocol}
                        value={draft.protocol}
                        onChange={(e) => {
                          const value = e.currentTarget
                            .value as ProviderProtocol;
                          changeProtocol(value);
                        }}
                      >
                        {Object.entries(PROVIDER_PROTOCOLS).map(
                          ([id, name]) => (
                            <option value={id} key={id}>
                              {name}
                            </option>
                          ),
                        )}
                      </Select>
                    </ListItem>
                  )}
                  <ListItem title={t.Enabled}>
                    <input
                      type="checkbox"
                      aria-label={t.Enabled}
                      checked={draft.enabled}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        edit((next) => {
                          next.enabled = checked;
                        });
                      }}
                    />
                  </ListItem>
                  {draft.kind === "sdk" ? (
                    <>
                      <ListItem
                        title={t.Endpoint}
                        subTitle={t.EndpointHint}
                        vertical
                      >
                        <div className={styles.endpointField}>
                          <input
                            type="text"
                            className={styles.wide}
                            aria-label={t.Endpoint}
                            placeholder={PROTOCOL_BASE_URLS[draft.protocol]}
                            value={draft.baseUrl}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              if (value !== platformSelection?.baseUrl)
                                setPlatformSelection(undefined);
                              edit((next) => {
                                next.baseUrl = value;
                              });
                            }}
                          />
                          {platformSelection &&
                            !platformSelection.platform.baseUrls[
                              draft.protocol
                            ] && (
                              <p className={styles.hint} role="status">
                                {t.PlatformProtocolHint}
                              </p>
                            )}
                        </div>
                      </ListItem>
                      <ListItem title={t.Key}>
                        <PasswordInput
                          aria-label={t.Key}
                          placeholder={t.KeyPlaceholder}
                          value={draft.apiKey}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            edit((next) => {
                              next.apiKey = value;
                            });
                          }}
                        />
                      </ListItem>
                    </>
                  ) : (
                    <LegacyProviderFields
                      desktop
                      provider={draft.service!}
                      accessStore={{
                        ...access,
                        ...draft.values,
                        update: (updater) =>
                          edit((next) => {
                            const values = { ...access, ...next.values };
                            updater(values);
                            next.values = Object.fromEntries(
                              legacyFields(next.service!)
                                .filter((key) => key in values)
                                .map((key) => [
                                  key,
                                  values[key as keyof typeof values],
                                ]),
                            );
                          }),
                      }}
                    />
                  )}
                  <ListItem title={t.Test} className={styles.testing}>
                    <div className={styles.testControls}>
                      <div className={styles.actions}>
                        {test.status !== "idle" && (
                          <p
                            role="status"
                            data-status={test.status}
                            className={
                              test.status === "error"
                                ? styles.error
                                : styles.hint
                            }
                          >
                            {test.status === "running"
                              ? t.Testing
                              : test.status === "success"
                                ? t.Success
                                : `${t.Failed}: ${test.message}`}
                          </p>
                        )}
                        <IconButton
                          icon={<ConnectionIcon />}
                          aria={test.status === "running" ? t.Testing : t.Test}
                          text={test.status === "running" ? t.Testing : t.Test}
                          disabled={
                            !selected ||
                            dirty ||
                            !testModel ||
                            !draft.enabled ||
                            test.status === "running"
                          }
                          onClick={() => void runTest()}
                        />
                        <Select
                          aria-label={t.TestModel}
                          value={testModel}
                          disabled={
                            !selected || dirty || test.status === "running"
                          }
                          onChange={(e) => setTestModel(e.currentTarget.value)}
                        >
                          <option value="">{t.TestModel}</option>
                          {draft.models
                            .filter((m) => m.enabled)
                            .map((m) => (
                              <option value={m.id} key={m.id}>
                                {m.displayName || m.id}
                              </option>
                            ))}
                        </Select>
                      </div>
                    </div>
                  </ListItem>
                </List>
                <div className={styles.sectionHeader}>
                  <h3>{t.Models}</h3>
                  <div className={styles.actions}>
                    <IconButton
                      text={t.Manual}
                      icon={<AddIcon />}
                      onClick={() => {
                        edit((next) => {
                          next.models.push(
                            newModelDraft(createProviderModel("")),
                          );
                        });
                      }}
                    />
                    {draft.kind === "sdk" && (
                      <IconButton
                        disabled={fetching}
                        text={fetching ? t.Fetching : t.Fetch}
                        onClick={() => void fetchModels()}
                      />
                    )}
                  </div>
                </div>
                {!draft.models.length && (
                  <p className={styles.empty}>{t.NoModel}</p>
                )}
                {!!draft.models.length && (
                  <div className={styles.modelsTableWrap}>
                    <table className={styles.modelsTable}>
                      <thead>
                        <tr>
                          <th scope="col">{t.ModelId}</th>
                          <th scope="col">{t.DisplayName}</th>
                          <th scope="col">{t.Enabled}</th>
                          {draft.kind === "sdk" && (
                            <>
                              <th scope="col">{t.Vision}</th>
                              <th scope="col">{t.Params}</th>
                            </>
                          )}
                          <th scope="col">{t.Actions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.models.map((model, index) => (
                          <tr key={index}>
                            <td>
                              <input
                                type="text"
                                aria-label={`${t.ModelId} ${index + 1}`}
                                value={model.id}
                                onChange={(e) => {
                                  const value = e.currentTarget.value;
                                  edit((next) => {
                                    const current = next.models[index];
                                    if (
                                      current.displayName.trim() ===
                                      current.id.trim()
                                    )
                                      current.displayName = value;
                                    current.id = value;
                                  });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                aria-label={`${t.DisplayName} ${index + 1}`}
                                value={model.displayName}
                                onChange={(e) => {
                                  const value = e.currentTarget.value;
                                  edit((next) => {
                                    next.models[index].displayName = value;
                                  });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`${t.Enabled} ${index + 1}`}
                                checked={model.enabled}
                                onChange={(e) => {
                                  const checked = e.currentTarget.checked;
                                  edit((next) => {
                                    next.models[index].enabled = checked;
                                  });
                                }}
                              />
                            </td>
                            {draft.kind === "sdk" && (
                              <>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`${t.Vision} ${index + 1}`}
                                    checked={model.vision}
                                    onChange={(e) => {
                                      const checked = e.currentTarget.checked;
                                      edit((next) => {
                                        next.models[index].vision = checked;
                                      });
                                    }}
                                  />
                                </td>
                                <td className={styles.tableAction}>
                                  <IconButton
                                    text={t.Modify}
                                    aria={`${t.Params} ${index + 1}`}
                                    onClick={() => openOptions(index)}
                                  />
                                </td>
                              </>
                            )}
                            <td className={styles.tableAction}>
                              <IconButton
                                icon={<DeleteIcon />}
                                title={t.Remove}
                                aria={`${t.Remove} ${
                                  model.displayName || model.id
                                }`}
                                onClick={() =>
                                  edit((next) => {
                                    next.models.splice(index, 1);
                                  })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Modal>
          </div>,
          document.body,
        )}
      {draft &&
        optionsIndex !== undefined &&
        createPortal(
          <div className="modal-mask">
            <Modal
              title={t.ParamsTitle(
                draft.models[optionsIndex]?.displayName ||
                  draft.models[optionsIndex]?.id ||
                  "",
              )}
              onClose={closeOptions}
              actions={[
                <IconButton
                  key="cancel"
                  className={styles.footerButton}
                  text={t.Cancel}
                  bordered
                  onClick={closeOptions}
                />,
                <IconButton
                  key="save"
                  className={styles.footerButton}
                  text={t.Save}
                  type="primary"
                  onClick={saveOptions}
                />,
              ]}
            >
              <List>
                <ModelParamsEditor
                  protocol={draft.protocol}
                  params={optionsParams}
                  onChange={setOptionsParams}
                />
                <ListItem title={t.Options} vertical>
                  <textarea
                    className={styles.wide}
                    aria-label={t.Options}
                    rows={8}
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.currentTarget.value)}
                  />
                </ListItem>
              </List>
            </Modal>
          </div>,
          document.body,
        )}
      {draft &&
        fetchedModels &&
        createPortal(
          <div className="modal-mask">
            <Modal
              title={t.SelectModels}
              onClose={() => {
                setFetchedModels(undefined);
                setFetchedSelection({});
                setFetchedSearch("");
              }}
              actions={[
                <IconButton
                  key="cancel"
                  className={styles.footerButton}
                  text={t.Cancel}
                  onClick={() => {
                    setFetchedModels(undefined);
                    setFetchedSelection({});
                    setFetchedSearch("");
                  }}
                />,
                <IconButton
                  key="add"
                  className={styles.footerButton}
                  text={t.AddSelected}
                  type="primary"
                  onClick={addFetchedModels}
                />,
              ]}
            >
              <div className={styles.fetchedModels}>
                <input
                  type="search"
                  className={styles.fetchedSearch}
                  aria-label={t.SearchModels}
                  placeholder={t.SearchModels}
                  value={fetchedSearch}
                  onChange={(event) =>
                    setFetchedSearch(event.currentTarget.value)
                  }
                />
                {visibleFetchedModels.length ? (
                  visibleFetchedModels.map((model) => {
                    const existing = draft.models.some(
                      (current) => current.id === model.id,
                    );
                    return (
                      <label className={styles.fetchedModel} key={model.id}>
                        <input
                          type="checkbox"
                          disabled={existing}
                          checked={existing || !!fetchedSelection[model.id]}
                          onChange={(event) =>
                            setFetchedSelection((current) => ({
                              ...current,
                              [model.id]: event.currentTarget.checked,
                            }))
                          }
                        />
                        <span>{model.id}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className={styles.empty}>
                    {fetchedModels.length
                      ? t.NoMatchingModels
                      : t.NoFetchedModels}
                  </p>
                )}
              </div>
            </Modal>
          </div>,
          document.body,
        )}
      {draft?.kind === "sdk" &&
        platformPicker &&
        createPortal(
          <div className={`modal-mask ${styles.platformMask}`}>
            <ProviderPlatformPicker
              onSelect={selectPlatform}
              onClose={() => setPlatformPicker(false)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
