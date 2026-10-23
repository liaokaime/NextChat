import { useState } from "react";
import { nanoid } from "nanoid";
import { useAccessStore } from "../store/access";
import {
  PROVIDER_PROTOCOLS,
  PROTOCOL_BASE_URLS,
  createProviderModel,
  normalizeBaseUrl,
  type ProviderInstance,
  type ProviderModel,
  type ProviderProtocol,
} from "../client/providers";
import { fetchProviderModels } from "../client/provider-http";
import { fetch } from "../utils/stream";
import { IconButton } from "./button";
import {
  List,
  ListItem,
  Modal,
  PasswordInput,
  Select,
  showConfirm,
} from "./ui-lib";
import AddIcon from "../icons/add.svg";
import EditIcon from "../icons/edit.svg";
import CopyIcon from "../icons/copy.svg";
import DeleteIcon from "../icons/clear.svg";
import styles from "./provider-settings.module.scss";

type ModelDraft = ProviderModel & { optionsText: string };
type Draft = Omit<ProviderInstance, "models"> & { models: ModelDraft[] };
const toDraft = (p: ProviderInstance): Draft => ({
  ...structuredClone(p),
  models: p.models.map((m) => ({
    ...m,
    optionsText: JSON.stringify(m.providerOptions, null, 2),
  })),
});

function jsonObject(text: string): Record<string, unknown> {
  const value = JSON.parse(text || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("请输入 JSON 对象。");
  return value;
}

export function ProviderSettings() {
  const access = useAccessStore();
  const [editing, setEditing] = useState<ProviderInstance>();
  return (
    <>
      <List>
        <ListItem
          title="服务商与中转"
          subTitle="可添加多个同类服务商，在聊天模型菜单中按实例选择。"
        >
          <IconButton
            icon={<AddIcon />}
            text="添加"
            onClick={() =>
              setEditing({
                id: nanoid(),
                name: "新中转",
                protocol: "openai-chat",
                baseUrl: "",
                apiKey: "",
                headers: {},
                models: [],
                enabled: true,
              })
            }
          />
        </ListItem>
        {access.providers.map((provider) => (
          <ListItem
            key={provider.id}
            title={provider.name}
            subTitle={`${PROVIDER_PROTOCOLS[provider.protocol]} · ${
              provider.models.filter((m) => m.enabled).length
            } 个模型`}
          >
            <div className={styles.actions}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`启用 ${provider.name}`}
                  checked={provider.enabled}
                  onChange={(e) =>
                    access.update((state) => {
                      state.providers.find(
                        (p) => p.id === provider.id,
                      )!.enabled = e.target.checked;
                    })
                  }
                />
                启用
              </label>
              <IconButton
                icon={<EditIcon />}
                title="编辑"
                onClick={() => setEditing(provider)}
              />
              <IconButton
                icon={<CopyIcon />}
                title="复制"
                onClick={() =>
                  setEditing({
                    ...structuredClone(provider),
                    id: nanoid(),
                    name: `${provider.name} 副本`,
                  })
                }
              />
              <IconButton
                icon={<DeleteIcon />}
                title="删除"
                onClick={async () => {
                  if (
                    await showConfirm(
                      `删除“${provider.name}”？使用它的会话将需要重新选择模型。`,
                    )
                  )
                    access.update((state) => {
                      state.providers = state.providers.filter(
                        (p) => p.id !== provider.id,
                      );
                    });
                }}
              />
            </div>
          </ListItem>
        ))}
      </List>
      {editing && (
        <ProviderEditor
          key={editing.id}
          provider={editing}
          onClose={() => setEditing(undefined)}
          onSave={(provider) => {
            access.update((state) => {
              const index = state.providers.findIndex(
                (p) => p.id === provider.id,
              );
              if (index < 0) state.providers.push(provider);
              else state.providers[index] = provider;
              state.providerInstancesInitialized = true;
            });
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function ProviderEditor(props: {
  provider: ProviderInstance;
  onSave: (p: ProviderInstance) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(props.provider));
  const [headersText, setHeadersText] = useState(
    JSON.stringify(props.provider.headers, null, 2),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const edit = (update: (d: Draft) => void) =>
    setDraft((previous) => {
      const next = structuredClone(previous);
      update(next);
      return next;
    });
  const read = (): ProviderInstance => {
    if (!draft.name.trim()) throw new Error("请填写显示名称。");
    const headers = jsonObject(headersText);
    if (Object.values(headers).some((v) => typeof v !== "string"))
      throw new Error("请求头的值须为字符串。");
    new Headers(headers as Record<string, string>);
    const ids = new Set<string>();
    const models = draft.models.map(({ optionsText, ...model }) => {
      const id = model.id.trim();
      if (!id || ids.has(id))
        throw new Error("模型 ID 不能为空，同一实例内不能重复。");
      ids.add(id);
      const options = jsonObject(optionsText);
      if (
        Object.values(options).some(
          (v) => !v || typeof v !== "object" || Array.isArray(v),
        )
      )
        throw new Error(
          '模型专用选项须按 provider 命名空间分组，例如 {"openai": {"reasoningEffort": "high"}}。',
        );
      return {
        ...model,
        id,
        displayName: model.displayName.trim() || id,
        providerOptions: options as ProviderModel["providerOptions"],
      };
    });
    return {
      ...draft,
      name: draft.name.trim(),
      baseUrl: normalizeBaseUrl(draft.baseUrl),
      headers: headers as Record<string, string>,
      models,
    };
  };
  return (
    <div className="modal-mask">
      <Modal
        title="服务商设置"
        onClose={props.onClose}
        actions={[
          <IconButton key="cancel" text="取消" onClick={props.onClose} />,
          <IconButton
            key="save"
            text="保存"
            type="primary"
            onClick={() => {
              try {
                props.onSave(read());
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />,
        ]}
      >
        <div className={styles.editor}>
          <List>
            <ListItem title="显示名称">
              <input
                aria-label="服务商显示名称"
                value={draft.name}
                onChange={(e) =>
                  edit((d) => {
                    d.name = e.target.value;
                  })
                }
              />
            </ListItem>
            <ListItem title="协议">
              <Select
                aria-label="服务商协议"
                value={draft.protocol}
                onChange={(e) =>
                  edit((d) => {
                    d.protocol = e.target.value as ProviderProtocol;
                  })
                }
              >
                {Object.entries(PROVIDER_PROTOCOLS).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </ListItem>
            <ListItem
              title="API 基础地址"
              subTitle="填写包含版本前缀的地址，如 https://example.com/v1，不包含 /chat/completions 等完整接口。"
              vertical
            >
              <input
                aria-label="API 基础地址"
                className={styles.wide}
                value={draft.baseUrl}
                placeholder={PROTOCOL_BASE_URLS[draft.protocol]}
                onChange={(e) =>
                  edit((d) => {
                    d.baseUrl = e.target.value;
                  })
                }
              />
            </ListItem>
            <ListItem title="API 密钥">
              <PasswordInput
                aria-label="API 密钥"
                value={draft.apiKey}
                onChange={(e) =>
                  edit((d) => {
                    d.apiKey = e.currentTarget.value;
                  })
                }
              />
            </ListItem>
            <ListItem
              title="自定义请求头"
              subTitle="可选，JSON 格式；同名请求头覆盖默认值。"
              vertical
            >
              <textarea
                aria-label="自定义请求头"
                className={styles.wide}
                rows={3}
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
              />
            </ListItem>
          </List>
          <div className={styles.actions}>
            <strong>模型</strong>
            <IconButton
              icon={<AddIcon />}
              text="手动添加"
              onClick={() =>
                edit((d) => {
                  d.models.push({
                    ...createProviderModel(""),
                    optionsText: "{}",
                  });
                })
              }
            />
            <IconButton
              text={loading ? "正在获取…" : "获取模型列表"}
              disabled={loading}
              onClick={async () => {
                try {
                  const instance = read();
                  setError("");
                  setNotice("");
                  setLoading(true);
                  const models = await fetchProviderModels(instance, fetch);
                  const additions = models.filter(
                    (m) => !instance.models.some((saved) => saved.id === m.id),
                  );
                  setDraft((current) => ({
                    ...current,
                    models: [
                      ...current.models,
                      ...additions
                        .filter(
                          (m) =>
                            !current.models.some((saved) => saved.id === m.id),
                        )
                        .map((m) => ({
                          ...m,
                          optionsText: JSON.stringify(
                            m.providerOptions,
                            null,
                            2,
                          ),
                        })),
                    ],
                  }));
                  setNotice(`已获取模型列表。现有模型设置已保留。`);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setLoading(false);
                }
              }}
            />
          </div>
          {draft.models.length === 0 && (
            <p>添加模型 ID 即可使用。获取列表失败时也可以手动添加。</p>
          )}
          {draft.models.map((model, index) => (
            <div className={styles.model} key={index}>
              <div className={styles.row}>
                <input
                  aria-label={`模型 ID ${index + 1}`}
                  placeholder="模型 ID（实际发送的名称）"
                  value={model.id}
                  onChange={(e) =>
                    edit((d) => {
                      d.models[index].id = e.target.value;
                    })
                  }
                />
                <input
                  aria-label={`模型显示名 ${index + 1}`}
                  placeholder="显示名称"
                  value={model.displayName}
                  onChange={(e) =>
                    edit((d) => {
                      d.models[index].displayName = e.target.value;
                    })
                  }
                />
                <IconButton
                  icon={<DeleteIcon />}
                  title="移除模型"
                  onClick={() =>
                    edit((d) => {
                      d.models.splice(index, 1);
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
                      edit((d) => {
                        d.models[index].enabled = e.target.checked;
                      })
                    }
                  />
                  启用
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={model.vision}
                    onChange={(e) =>
                      edit((d) => {
                        d.models[index].vision = e.target.checked;
                      })
                    }
                  />
                  图片输入
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={model.sampling}
                    onChange={(e) =>
                      edit((d) => {
                        d.models[index].sampling = e.target.checked;
                      })
                    }
                  />
                  发送温度等采样参数
                </label>
              </div>
              <details>
                <summary>模型专用选项</summary>
                <p>
                  可按 openai、anthropic、google 或 relay
                  命名空间填写思考预算等选项。
                </p>
                <textarea
                  aria-label={`模型专用选项 ${index + 1}`}
                  className={styles.wide}
                  rows={3}
                  value={model.optionsText}
                  onChange={(e) =>
                    edit((d) => {
                      d.models[index].optionsText = e.target.value;
                    })
                  }
                />
              </details>
            </div>
          ))}
          <p>新实例支持聊天、图片输入及推理过程展示。</p>
          {notice && <p role="status">{notice}</p>}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
