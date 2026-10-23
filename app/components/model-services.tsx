import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  UNSAFE_NavigationContext,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { nanoid } from "nanoid";
import Locale from "../locales";
import { Path, ServiceProvider } from "../constant";
import { useAccessStore } from "../store/access";
import { useAppConfig } from "../store/config";
import { useChatStore } from "../store/chat";
import { useMaskStore } from "../store/mask";
import { collectModels } from "../utils/model";
import {
  connectionViews,
  legacyFields,
  legacyKey,
  referencesConnection,
  sdkKey,
  type ConnectionView,
} from "../client/connections";
import {
  createProviderModel,
  normalizeBaseUrl,
  PROVIDER_PROTOCOLS,
  PROTOCOL_BASE_URLS,
  type ProviderInstance,
  type ProviderModel,
  type ProviderProtocol,
} from "../client/providers";
import { fetchProviderModels } from "../client/provider-http";
import { getClientApi, type LLMModel } from "../client/api";
import { testConnection } from "../client/connection-test";
import { fetch } from "../utils/stream";
import { installUnsavedNavigation } from "../utils/unsaved-navigation";
import { LegacyProviderFields } from "./legacy-provider-fields";
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
import CloseIcon from "../icons/close.svg";
import AddIcon from "../icons/add.svg";
import CopyIcon from "../icons/copy.svg";
import DeleteIcon from "../icons/clear.svg";
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
  headersText: string;
  models: ModelDraft[];
  values: Record<string, unknown>;
};
const modelDraft = (model: ProviderModel): ModelDraft => ({
  ...structuredClone(model),
  optionsText: JSON.stringify(model.providerOptions || {}, null, 2),
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
  const headers = objectJson(draft.headersText);
  if (Object.values(headers).some((value) => typeof value !== "string"))
    throw new Error(Locale.ModelServices.InvalidHeaders);
  new Headers(headers as Record<string, string>);
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
    headers: headers as Record<string, string>,
    models: validateModels(draft.models),
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
  const navigate = useNavigate(),
    location = useLocation();
  const [params, setParams] = useSearchParams();
  const [listOnly, setListOnly] = useState(!params.has("connection"));
  const [selectedKey, setSelectedKey] = useState(
    params.get("connection") || "",
  );
  const [draft, setDraft] = useState<Draft>();
  const [original, setOriginal] = useState("");
  const [templates, setTemplates] = useState(false);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [testModel, setTestModel] = useState("");
  const [test, setTest] = useState<{
    status: "idle" | "running" | "success" | "error";
    message?: string;
  }>({ status: "idle" });
  const testAbort = useRef<AbortController>();
  const fetchVersion = useRef(0);
  const dirty = !!draft && JSON.stringify(draft) !== original;
  const dirtyRef = useUnsavedNavigation(dirty);
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
        refs
          .flatMap((r) => [
            ...(!r.providerId ? [r.providerName] : []),
            ...(r.compressModel && !r.compressProviderId
              ? [r.compressProviderName]
              : []),
          ])
          .concat(
            config.ttsConfig.enable && config.ttsConfig.engine === "OpenAI-TTS"
              ? [ServiceProvider.OpenAI]
              : [],
          ),
      ),
    [access, legacyModels, refs, config.ttsConfig],
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
    headersText: JSON.stringify(
      view.kind === "sdk" ? view.instance.headers : {},
      null,
      2,
    ),
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
    setListOnly(false);
    setError("");
    setFetching(false);
    setParams(
      { connection: view.key },
      { replace: true, state: location.state },
    );
  };
  useEffect(() => {
    if (!access._hasHydrated || !config._hasHydrated) return;
    const view =
      views.find((v) => v.key === (params.get("connection") || selectedKey)) ||
      (!draft ? views[0] : undefined);
    if (view && !dirtyRef.current) {
      const next = makeDraft(view);
      setDraft(next);
      setOriginal(JSON.stringify(next));
      setSelectedKey(view.key);
    } else if (draft && !view && !dirtyRef.current) {
      setDraft(undefined);
      setSelectedKey("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, config.models, config.customModels, params]);
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
    const global =
      Number(referencesConnection(config.modelConfig, view)) +
      Number(
        view.key === legacyKey(ServiceProvider.OpenAI) &&
          config.ttsConfig.enable &&
          config.ttsConfig.engine === "OpenAI-TTS",
      );
    return {
      count: sessions + countMasks + global,
      text: t.Affected(sessions, countMasks, global),
    };
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
      setOriginal(JSON.stringify(draft));
      setError("");
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
    setDraft(undefined);
    setSelectedKey("");
    setOriginal("");
    setParams({}, { replace: true, state: location.state });
  };
  const newDraft = (next: Draft) => {
    dirtyRef.current = false;
    fetchVersion.current++;
    setFetching(false);
    setParams(
      { connection: next.key },
      { replace: true, state: location.state },
    );
    setDraft(next);
    setSelectedKey(next.key);
    setListOnly(false);
    setOriginal("");
    setTemplates(false);
    setError("");
  };
  const beginSdk = (
    name: string,
    protocol: ProviderProtocol,
    baseUrl: string,
    modelIds: string[] = [],
  ) => {
    const id = nanoid();
    const nameCount = views.filter(
      (v) => v.name === name || v.name.startsWith(`${name} (`),
    ).length;
    newDraft({
      key: sdkKey(id),
      kind: "sdk",
      id,
      name: nameCount ? `${name} (${nameCount + 1})` : name,
      enabled: true,
      protocol,
      baseUrl,
      apiKey: "",
      headersText: "{}",
      models: modelIds.map((id) => modelDraft(createProviderModel(id))),
      values: {},
    });
  };
  const beginLegacy = (service: ServiceProvider) => {
    const existing = views.find(
      (v) => v.kind === "legacy" && v.service === service,
    );
    if (existing) {
      load(existing);
      setTemplates(false);
      return;
    }
    const view: ConnectionView = {
      key: legacyKey(service),
      kind: "legacy",
      service,
      name: service,
      baseUrl: "",
      enabled: true,
      models: legacyModels
        .filter(
          (m) =>
            m.provider?.providerName.toLowerCase() === service.toLowerCase(),
        )
        .map((m) => ({
          ...createProviderModel(m.name),
          displayName: m.displayName,
          enabled: m.available,
        })),
    };
    newDraft(makeDraft(view));
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
    if (!draft || dirty || !testModel || !draft.enabled) return;
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
      edit((next) => {
        next.models.push(
          ...models
            .filter(
              (m) => !next.models.some((existing) => existing.id === m.id),
            )
            .map(modelDraft),
        );
      });
      showToast(t.Fetched);
    } catch (e) {
      if (version === fetchVersion.current) setError((e as Error).message);
    } finally {
      if (version === fetchVersion.current) setFetching(false);
    }
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
  const discard = () => {
    fetchVersion.current++;
    setFetching(false);
    if (selected) load(selected);
    else {
      dirtyRef.current = false;
      setDraft(undefined);
      setOriginal("");
      setSelectedKey("");
      setParams({}, { replace: true, state: location.state });
    }
  };
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const back = () =>
    navigate(
      returnTo === Path.Chat || returnTo === Path.Home
        ? returnTo
        : Path.Settings,
    );
  return (
    <>
      <div className="window-header" data-tauri-drag-region>
        <div className="window-header-title">
          <div className="window-header-main-title">{t.Title}</div>
          <div className="window-header-sub-title">{t.Subtitle}</div>
        </div>
        <div className="window-actions">
          <IconButton icon={<CloseIcon />} text={t.Back} onClick={back} />
        </div>
      </div>
      <div className={styles.page} data-detail={!!draft && !listOnly}>
        <aside className={styles.connections} aria-label={t.Connections}>
          <div className={styles.sectionHeader}>
            <h2>{t.Connections}</h2>
            <IconButton
              icon={<AddIcon />}
              text={t.Add}
              onClick={async () => {
                if (!dirty || (await showConfirm(t.Unsaved))) {
                  if (dirty) discard();
                  setTemplates(true);
                }
              }}
            />
          </div>
          {!views.length && <p className={styles.hint}>{t.Empty}</p>}
          {views.map((view) => (
            <button
              key={view.key}
              className={styles.connection}
              aria-pressed={view.key === selectedKey}
              onClick={() => void select(view)}
            >
              <strong>{view.name}</strong>
              <small>
                {(() => {
                  try {
                    return new URL(view.baseUrl).host;
                  } catch {
                    return view.baseUrl;
                  }
                })()}
              </small>
              <span>
                {view.enabled
                  ? t.Count(view.models.filter((m) => m.enabled).length)
                  : t.Disabled}
              </span>
            </button>
          ))}
        </aside>
        <main className={styles.detail}>
          {!draft ? (
            <p className={styles.empty}>{t.SelectConnection}</p>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <button
                  className={styles.mobileBack}
                  onClick={async () => {
                    if (!dirty || (await showConfirm(t.Unsaved))) {
                      if (selected) load(selected);
                      else {
                        dirtyRef.current = false;
                        setDraft(undefined);
                        setOriginal("");
                      }
                      setListOnly(true);
                    }
                  }}
                >
                  {t.Connections}
                </button>
                <h2>{draft.name || t.New}</h2>
                <div className={styles.actions}>
                  {draft.kind === "sdk" && (
                    <IconButton
                      icon={<CopyIcon />}
                      text={t.Copy}
                      onClick={duplicate}
                    />
                  )}
                  {selected && (
                    <IconButton
                      icon={<DeleteIcon />}
                      text={t.Delete}
                      type="danger"
                      onClick={() => void remove()}
                    />
                  )}
                  <IconButton
                    text={t.Cancel}
                    disabled={!dirty}
                    onClick={discard}
                  />
                  <IconButton
                    text={t.Save}
                    type="primary"
                    disabled={!dirty}
                    onClick={() => void save()}
                  />
                </div>
              </div>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <h3>{t.Settings}</h3>
              <List>
                <ListItem title={t.Name}>
                  <input
                    aria-label={t.Name}
                    value={draft.name}
                    onChange={(e) =>
                      edit((next) => {
                        next.name = e.target.value;
                      })
                    }
                  />
                </ListItem>
                <ListItem title={t.Enabled}>
                  <input
                    type="checkbox"
                    aria-label={t.Enabled}
                    checked={draft.enabled}
                    onChange={(e) =>
                      edit((next) => {
                        next.enabled = e.target.checked;
                      })
                    }
                  />
                </ListItem>
                {draft.kind === "sdk" ? (
                  <>
                    <ListItem
                      title={t.Endpoint}
                      subTitle={t.EndpointHint}
                      vertical
                    >
                      <input
                        className={styles.wide}
                        aria-label={t.Endpoint}
                        placeholder={PROTOCOL_BASE_URLS[draft.protocol]}
                        value={draft.baseUrl}
                        onChange={(e) =>
                          edit((next) => {
                            next.baseUrl = e.target.value;
                          })
                        }
                      />
                    </ListItem>
                    <ListItem title={t.Key}>
                      <PasswordInput
                        aria-label={t.Key}
                        value={draft.apiKey}
                        onChange={(e) =>
                          edit((next) => {
                            next.apiKey = e.currentTarget.value;
                          })
                        }
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
              </List>
              <section className={styles.testing}>
                <h3>{t.Test}</h3>
                <p className={styles.hint}>
                  {dirty ? t.SaveBeforeTest : t.TestHint}
                </p>
                <div className={styles.actions}>
                  <Select
                    aria-label={t.TestModel}
                    value={testModel}
                    disabled={dirty || test.status === "running"}
                    onChange={(e) => setTestModel(e.target.value)}
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
                  <IconButton
                    text={test.status === "running" ? t.Testing : t.Test}
                    disabled={
                      dirty ||
                      !testModel ||
                      !draft.enabled ||
                      test.status === "running"
                    }
                    onClick={() => void runTest()}
                  />
                </div>
                <p
                  role="status"
                  className={
                    test.status === "error" ? styles.error : styles.hint
                  }
                >
                  {test.status === "idle"
                    ? t.Untested
                    : test.status === "running"
                    ? t.Testing
                    : test.status === "success"
                    ? t.Success
                    : `${t.Failed}: ${test.message}`}
                </p>
              </section>
              <div className={styles.sectionHeader}>
                <h3>{t.Models}</h3>
                <div className={styles.actions}>
                  <IconButton
                    text={t.Manual}
                    icon={<AddIcon />}
                    onClick={() =>
                      edit((next) => {
                        next.models.push(modelDraft(createProviderModel("")));
                      })
                    }
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
              <p className={styles.hint}>{t.ModelHint}</p>
              {draft.models.map((model, index) => (
                <div className={styles.model} key={index}>
                  <div className={styles.modelFields}>
                    <label>
                      {t.ModelId}
                      <input
                        aria-label={`${t.ModelId} ${index + 1}`}
                        value={model.id}
                        onChange={(e) =>
                          edit((next) => {
                            next.models[index].id = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      {t.DisplayName}
                      <input
                        aria-label={`${t.DisplayName} ${index + 1}`}
                        value={model.displayName}
                        onChange={(e) =>
                          edit((next) => {
                            next.models[index].displayName = e.target.value;
                          })
                        }
                      />
                    </label>
                    <IconButton
                      icon={<DeleteIcon />}
                      title={t.Remove}
                      onClick={() =>
                        edit((next) => {
                          next.models.splice(index, 1);
                        })
                      }
                    />
                  </div>
                  <div className={styles.actions}>
                    <label>
                      <input
                        type="checkbox"
                        checked={model.enabled}
                        onChange={(e) =>
                          edit((next) => {
                            next.models[index].enabled = e.target.checked;
                          })
                        }
                      />
                      {t.Enabled}
                    </label>
                    {draft.kind === "sdk" && (
                      <>
                        <label>
                          <input
                            type="checkbox"
                            checked={model.vision}
                            onChange={(e) =>
                              edit((next) => {
                                next.models[index].vision = e.target.checked;
                              })
                            }
                          />
                          {t.Vision}
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={model.sampling}
                            onChange={(e) =>
                              edit((next) => {
                                next.models[index].sampling = e.target.checked;
                              })
                            }
                          />
                          {t.Sampling}
                        </label>
                      </>
                    )}
                  </div>
                  {draft.kind === "sdk" && (
                    <details>
                      <summary>{t.Options}</summary>
                      <textarea
                        className={styles.wide}
                        aria-label={`${t.Options} ${index + 1}`}
                        rows={3}
                        value={model.optionsText}
                        onChange={(e) =>
                          edit((next) => {
                            next.models[index].optionsText = e.target.value;
                          })
                        }
                      />
                    </details>
                  )}
                </div>
              ))}
              {draft.kind === "sdk" && (
                <details className={styles.advanced}>
                  <summary>{t.Advanced}</summary>
                  <List>
                    <ListItem title={t.Protocol}>
                      <Select
                        aria-label={t.Protocol}
                        value={draft.protocol}
                        onChange={(e) =>
                          edit((next) => {
                            next.protocol = e.target.value as ProviderProtocol;
                          })
                        }
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
                    <ListItem title={t.Headers} vertical>
                      <textarea
                        className={styles.wide}
                        aria-label={t.Headers}
                        rows={3}
                        value={draft.headersText}
                        onChange={(e) =>
                          edit((next) => {
                            next.headersText = e.target.value;
                          })
                        }
                      />
                    </ListItem>
                  </List>
                </details>
              )}
            </>
          )}
        </main>
      </div>
      {templates && (
        <div className="modal-mask">
          <Modal
            title={t.Template}
            onClose={() => setTemplates(false)}
            actions={[
              <IconButton
                key="cancel"
                text={t.Cancel}
                onClick={() => setTemplates(false)}
              />,
            ]}
          >
            <div className={styles.templates}>
              <button
                onClick={() =>
                  beginSdk(
                    "OpenAI",
                    "openai-chat",
                    PROTOCOL_BASE_URLS["openai-chat"],
                  )
                }
              >
                OpenAI
              </button>
              <button
                onClick={() =>
                  beginSdk(
                    "DeepSeek",
                    "openai-chat",
                    "https://api.deepseek.com",
                    ["deepseek-chat", "deepseek-reasoner"],
                  )
                }
              >
                DeepSeek
              </button>
              <button
                onClick={() =>
                  beginSdk(
                    "Anthropic",
                    "anthropic",
                    PROTOCOL_BASE_URLS.anthropic,
                  )
                }
              >
                Anthropic
              </button>
              <button
                onClick={() =>
                  beginSdk("Gemini", "google", PROTOCOL_BASE_URLS.google)
                }
              >
                Gemini
              </button>
              <button onClick={() => beginSdk(t.Relay, "openai-chat", "")}>
                {t.Relay}
              </button>
              <button
                onClick={() =>
                  beginSdk(t.Local, "openai-chat", "http://localhost:11434/v1")
                }
              >
                {t.Local}
              </button>
            </div>
            <details className={styles.advanced}>
              <summary>{t.Other}</summary>
              <div className={styles.templates}>
                {Object.values(ServiceProvider).map((service) => (
                  <button key={service} onClick={() => beginLegacy(service)}>
                    {service}
                  </button>
                ))}
              </div>
            </details>
          </Modal>
        </div>
      )}
    </>
  );
}
