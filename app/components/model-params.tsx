import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select } from "./ui-lib";
import {
  maxTemperature,
  REASONING_LEVELS,
  supportsPenalties,
  type ModelParams,
  type ProviderProtocol,
  type ReasoningLevel,
} from "../client/providers";
import styles from "./model-services.module.scss";

type NumericParam = Exclude<keyof ModelParams, "reasoning">;

// Unchecked rows leave the parameter out of the request.
function ParamRow(props: {
  title: string;
  subTitle: string;
  value?: number;
  initial: number;
  onChange: (value?: number) => void;
  children: (value: number) => React.JSX.Element;
}) {
  const t = Locale.ModelServices;
  return (
    <ListItem title={props.title} subTitle={props.subTitle}>
      <div className={styles.paramControl}>
        <label>
          <input
            type="checkbox"
            aria-label={`${props.title} ${t.CustomValue}`}
            checked={props.value !== undefined}
            onChange={(e) =>
              props.onChange(
                e.currentTarget.checked ? props.initial : undefined,
              )
            }
          />
          {t.CustomValue}
        </label>
        {props.value === undefined ? (
          <span className={styles.paramDefault}>{t.ProviderDefault}</span>
        ) : (
          props.children(props.value)
        )}
      </div>
    </ListItem>
  );
}

export function ModelParamsEditor(props: {
  protocol: ProviderProtocol;
  params: ModelParams;
  onChange: (params: ModelParams) => void;
}) {
  const t = Locale.ModelServices;
  const s = Locale.Settings;
  const { params, protocol } = props;
  const set = <K extends keyof ModelParams>(key: K, value?: ModelParams[K]) => {
    const next = { ...params };
    if (value === undefined) delete next[key];
    else next[key] = value;
    props.onChange(next);
  };
  const range = (
    key: NumericParam,
    title: string,
    subTitle: string,
    initial: number,
    min: number,
    max: number,
  ) => (
    <ParamRow
      title={title}
      subTitle={subTitle}
      value={params[key]}
      initial={initial}
      onChange={(value) => set(key, value)}
    >
      {(value) => (
        <InputRange
          aria={title}
          value={value.toFixed(1)}
          min={String(min)}
          max={String(max)}
          step="0.1"
          onChange={(e) => set(key, e.currentTarget.valueAsNumber)}
        />
      )}
    </ParamRow>
  );
  return (
    <>
      {range(
        "temperature",
        s.Temperature.Title,
        s.Temperature.SubTitle,
        1,
        0,
        maxTemperature(protocol),
      )}
      {range(
        "topP",
        s.TopP.Title,
        protocol === "anthropic" ? t.TopPAnthropic : s.TopP.SubTitle,
        1,
        0,
        1,
      )}
      {supportsPenalties(protocol) && (
        <>
          {range(
            "presencePenalty",
            s.PresencePenalty.Title,
            s.PresencePenalty.SubTitle,
            0,
            -2,
            2,
          )}
          {range(
            "frequencyPenalty",
            s.FrequencyPenalty.Title,
            s.FrequencyPenalty.SubTitle,
            0,
            -2,
            2,
          )}
        </>
      )}
      <ParamRow
        title={s.MaxTokens.Title}
        subTitle={t.MaxOutputTokens}
        value={params.maxOutputTokens}
        initial={4096}
        onChange={(value) => set("maxOutputTokens", value)}
      >
        {(value) => (
          <input
            type="number"
            aria-label={s.MaxTokens.Title}
            min={1}
            step={1}
            value={value}
            onChange={(e) => {
              const next = Math.round(e.currentTarget.valueAsNumber);
              if (next >= 1) set("maxOutputTokens", next);
            }}
          />
        )}
      </ParamRow>
      <ListItem title={t.Reasoning.Title} subTitle={t.Reasoning.SubTitle}>
        <Select
          aria-label={t.Reasoning.Title}
          value={params.reasoning ?? "provider-default"}
          onChange={(e) => {
            const value = e.currentTarget.value as ReasoningLevel;
            set("reasoning", value === "provider-default" ? undefined : value);
          }}
        >
          {REASONING_LEVELS.map((level) => (
            <option value={level} key={level}>
              {t.Reasoning.Levels[level]}
            </option>
          ))}
        </Select>
      </ListItem>
    </>
  );
}
