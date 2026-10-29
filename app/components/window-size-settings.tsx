import { useState } from "react";
import Locale from "../locales";
import { useAppConfig } from "../store/config";
import { getCurrentWindowSize } from "../utils/desktop-window";
import {
  isValidWindowDimension,
  DEFAULT_WINDOW_SIZE,
  WINDOW_SIZE_LIMITS,
} from "../utils/window-size";
import { IconButton } from "./button";
import { ListItem, showToast } from "./ui-lib";

export function WindowSizeSettings() {
  const size = useAppConfig((state) => state.windowSize);
  const [readingSize, setReadingSize] = useState(false);
  const text = Locale.Settings.WindowSize;

  return (
    <ListItem
      title={text.Title}
      subTitle={text.SubTitle}
      className="gap-3 flex-wrap"
    >
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <IconButton
          htmlType="button"
          text={text.Reset}
          bordered
          onClick={() => {
            useAppConfig.getState().update((config) => {
              config.windowSize = { ...DEFAULT_WINDOW_SIZE };
            });
          }}
        />
        <IconButton
          htmlType="button"
          text={text.UseCurrent}
          disabled={readingSize}
          bordered
          onClick={async () => {
            setReadingSize(true);
            try {
              const size = await getCurrentWindowSize();
              useAppConfig.getState().update((config) => {
                config.windowSize = {
                  width: Math.min(
                    WINDOW_SIZE_LIMITS.width.max,
                    Math.max(WINDOW_SIZE_LIMITS.width.min, size.width),
                  ),
                  height: Math.min(
                    WINDOW_SIZE_LIMITS.height.max,
                    Math.max(WINDOW_SIZE_LIMITS.height.min, size.height),
                  ),
                };
              });
            } catch {
              showToast(text.ReadFailed);
            } finally {
              setReadingSize(false);
            }
          }}
        />
        <WindowDimensionInput
          dimension="width"
          label={text.Width}
          value={size.width}
        />
        <WindowDimensionInput
          dimension="height"
          label={text.Height}
          value={size.height}
        />
      </div>
    </ListItem>
  );
}

function WindowDimensionInput(props: {
  dimension: keyof typeof DEFAULT_WINDOW_SIZE;
  label: string;
  value: number;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <label className="flex items-center gap-1 text-[12px] whitespace-nowrap">
      {props.label}
      <input
        className="w-[76px] max-w-full"
        type="number"
        min={WINDOW_SIZE_LIMITS[props.dimension].min}
        max={WINDOW_SIZE_LIMITS[props.dimension].max}
        step={1}
        value={draft ?? props.value}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          const value = Number(event.currentTarget.value);
          if (isValidWindowDimension(value, props.dimension)) {
            useAppConfig.getState().update((config) => {
              config.windowSize = {
                ...config.windowSize,
                [props.dimension]: value,
              };
            });
          }
          setDraft(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}
