export const DEFAULT_WINDOW_SIZE = { width: 960, height: 600 };
export const WINDOW_SIZE_LIMITS = {
  width: { min: 480, max: 7680 },
  height: { min: 320, max: 4320 },
};

export function isValidWindowDimension(
  value: unknown,
  dimension: keyof typeof DEFAULT_WINDOW_SIZE,
): value is number {
  const { min, max } = WINDOW_SIZE_LIMITS[dimension];
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function normalizeWindowSize(size: unknown) {
  const value = size as Partial<typeof DEFAULT_WINDOW_SIZE> | null;
  return {
    width: isValidWindowDimension(value?.width, "width")
      ? value.width
      : DEFAULT_WINDOW_SIZE.width,
    height: isValidWindowDimension(value?.height, "height")
      ? value.height
      : DEFAULT_WINDOW_SIZE.height,
  };
}
