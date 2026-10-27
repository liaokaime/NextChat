import Locale from "../locales";
import { useAllModels } from "../utils/hooks";
import { llmModelSelection } from "../client/providers";
import { modelConnectionName } from "../client/connections";
import type { LLMModel } from "../client/api";
import { Select } from "./ui-lib";
import styles from "./model-services.styles";

export function ModelPicker(props: {
  current: string;
  currentLabel?: string;
  allowFollow?: boolean;
  ariaLabel?: string;
  className?: string;
  models?: Array<ReturnType<typeof useAllModels>[number]>;
  onSelect: (model?: LLMModel) => void;
}) {
  const allModels = useAllModels();
  const available = (props.models ?? allModels).filter(
    (m): m is LLMModel => m.available && !!m.provider,
  );
  const following = props.allowFollow && props.current === "@";
  const unavailable =
    !following &&
    !available.some((m) => llmModelSelection(m) === props.current);

  return (
    <Select
      className={[styles.modelSelect, props.className]
        .filter(Boolean)
        .join(" ")}
      aria-label={props.ariaLabel || Locale.ModelServices.ChooseModel}
      value={props.current}
      align="left"
      onChange={(event) => {
        const key = event.currentTarget.value;
        if (props.allowFollow && key === "@") {
          props.onSelect();
          return;
        }
        const model = available.find((m) => llmModelSelection(m) === key);
        if (!model) return;
        props.onSelect(model);
      }}
    >
      {props.allowFollow && (
        <option value="@">{Locale.ModelServices.Following}</option>
      )}
      {unavailable && (
        <option value={props.current} disabled>
          {props.currentLabel || props.current} ·{" "}
          {Locale.ModelServices.Unavailable}
        </option>
      )}
      {available.map((model) => (
        <option key={llmModelSelection(model)} value={llmModelSelection(model)}>
          {model.displayName || model.name} · {modelConnectionName(model)}
        </option>
      ))}
    </Select>
  );
}
