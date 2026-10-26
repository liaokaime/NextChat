import { getClientConfig } from "../config/client";
import { ModelPicker } from "./model-picker";
import { ServiceProvider } from "@/app/constant";
import { ModalConfigValidator, ModelConfig } from "../store";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem } from "./ui-lib";
import { modelSelection } from "../client/providers";
import styles from "./settings.styles";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  globalSettings?: boolean;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
}) {
  const desktop = !!getClientConfig()?.isApp;
  const value = modelSelection(
    props.modelConfig.model,
    props.modelConfig.providerName,
    props.modelConfig.providerId,
  );
  const compressModelValue = modelSelection(
    props.modelConfig.compressModel,
    props.modelConfig.compressProviderName,
    props.modelConfig.compressProviderId,
  );

  return (
    <>
      <ListItem
        title={Locale.Settings.Model}
        subTitle={
          desktop && props.globalSettings
            ? Locale.ModelServices.GlobalHint
            : undefined
        }
      >
        <ModelPicker
          className={props.globalSettings ? styles.modelSelect : undefined}
          current={value}
          currentLabel={`${props.modelConfig.model} · ${props.modelConfig.providerName}`}
          ariaLabel={Locale.Settings.Model}
          onSelect={(model) => {
            if (!model) return;
            props.updateConfig((config) => {
              config.model = model.name;
              config.providerName = model.provider
                .providerName as ServiceProvider;
              config.providerId =
                model.provider.providerType === "ai-sdk"
                  ? model.provider.id
                  : undefined;
            });
          }}
        />
      </ListItem>
      {!props.modelConfig.providerId && (
        <>
          <ListItem
            title={Locale.Settings.Temperature.Title}
            subTitle={Locale.Settings.Temperature.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.Temperature.Title}
              value={props.modelConfig.temperature?.toFixed(1)}
              min="0"
              max="1" // lets limit it to 0-1
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.temperature = ModalConfigValidator.temperature(
                      e.currentTarget.valueAsNumber,
                    )),
                );
              }}
            ></InputRange>
          </ListItem>
          <ListItem
            title={Locale.Settings.TopP.Title}
            subTitle={Locale.Settings.TopP.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.TopP.Title}
              value={(props.modelConfig.top_p ?? 1).toFixed(1)}
              min="0"
              max="1"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.top_p = ModalConfigValidator.top_p(
                      e.currentTarget.valueAsNumber,
                    )),
                );
              }}
            ></InputRange>
          </ListItem>
          <ListItem
            title={Locale.Settings.MaxTokens.Title}
            subTitle={Locale.Settings.MaxTokens.SubTitle}
          >
            <input
              aria-label={Locale.Settings.MaxTokens.Title}
              type="number"
              min={1024}
              max={512000}
              value={props.modelConfig.max_tokens}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.max_tokens = ModalConfigValidator.max_tokens(
                      e.currentTarget.valueAsNumber,
                    )),
                )
              }
            ></input>
          </ListItem>

          {props.modelConfig.providerName !== ServiceProvider.Google && (
            <>
              <ListItem
                title={Locale.Settings.PresencePenalty.Title}
                subTitle={Locale.Settings.PresencePenalty.SubTitle}
              >
                <InputRange
                  aria={Locale.Settings.PresencePenalty.Title}
                  value={props.modelConfig.presence_penalty?.toFixed(1)}
                  min="-2"
                  max="2"
                  step="0.1"
                  onChange={(e) => {
                    props.updateConfig(
                      (config) =>
                        (config.presence_penalty =
                          ModalConfigValidator.presence_penalty(
                            e.currentTarget.valueAsNumber,
                          )),
                    );
                  }}
                ></InputRange>
              </ListItem>

              <ListItem
                title={Locale.Settings.FrequencyPenalty.Title}
                subTitle={Locale.Settings.FrequencyPenalty.SubTitle}
              >
                <InputRange
                  aria={Locale.Settings.FrequencyPenalty.Title}
                  value={props.modelConfig.frequency_penalty?.toFixed(1)}
                  min="-2"
                  max="2"
                  step="0.1"
                  onChange={(e) => {
                    props.updateConfig(
                      (config) =>
                        (config.frequency_penalty =
                          ModalConfigValidator.frequency_penalty(
                            e.currentTarget.valueAsNumber,
                          )),
                    );
                  }}
                ></InputRange>
              </ListItem>
            </>
          )}
        </>
      )}

      <ListItem
        title={Locale.Settings.InjectSystemPrompts.Title}
        subTitle={Locale.Settings.InjectSystemPrompts.SubTitle}
      >
        <input
          aria-label={Locale.Settings.InjectSystemPrompts.Title}
          type="checkbox"
          checked={props.modelConfig.enableInjectSystemPrompts}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.enableInjectSystemPrompts = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>

      <ListItem
        title={Locale.Settings.InputTemplate.Title}
        subTitle={Locale.Settings.InputTemplate.SubTitle}
      >
        <input
          aria-label={Locale.Settings.InputTemplate.Title}
          type="text"
          value={props.modelConfig.template}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.template = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.HistoryCount.Title}
        subTitle={Locale.Settings.HistoryCount.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.HistoryCount.Title}
          title={props.modelConfig.historyMessageCount.toString()}
          value={props.modelConfig.historyMessageCount}
          min="0"
          max="64"
          step="1"
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.historyMessageCount = e.target.valueAsNumber),
            )
          }
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.CompressThreshold.Title}
        subTitle={Locale.Settings.CompressThreshold.SubTitle}
      >
        <input
          aria-label={Locale.Settings.CompressThreshold.Title}
          type="number"
          className={styles.compressThresholdInput}
          min={500}
          max={512000}
          value={props.modelConfig.compressMessageLengthThreshold}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.compressMessageLengthThreshold =
                  e.currentTarget.valueAsNumber),
            )
          }
        ></input>
      </ListItem>
      <ListItem title={Locale.Memory.Title} subTitle={Locale.Memory.Send}>
        <input
          aria-label={Locale.Memory.Title}
          type="checkbox"
          checked={props.modelConfig.sendMemory}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.sendMemory = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.CompressModel.Title}
        subTitle={Locale.Settings.CompressModel.SubTitle}
      >
        <ModelPicker
          current={props.modelConfig.compressModel ? compressModelValue : "@"}
          currentLabel={props.modelConfig.compressModel}
          ariaLabel={Locale.Settings.CompressModel.Title}
          allowFollow
          onSelect={(model) =>
            props.updateConfig((config) => {
              config.compressModel = model?.name || "";
              config.compressProviderName = model?.provider.providerName || "";
              config.compressProviderId =
                model?.provider.providerType === "ai-sdk"
                  ? model.provider.id
                  : undefined;
            })
          }
        />
      </ListItem>
    </>
  );
}
