/**
 * Chart theming for the admin panel (dark-only app).
 *
 * Categorical slots are assigned in FIXED order — series 1 is always blue,
 * series 2 orange, etc. Never cycle or generate hues past slot 8; fold the
 * tail into "Other" instead. This ordering + these steps were validated
 * (CVD separation, normal-vision floor, 3:1 contrast) against the app's
 * card surface #18181b.
 */

export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

/** Sequential ramp (single hue, light→dark) for magnitude encodings. */
export const SEQUENTIAL = [
  "#86b6ef",
  "#5598e7",
  "#3987e5",
  "#256abf",
  "#1c5cab",
  "#184f95",
] as const;

/**
 * Status colors are reserved for state (never "series 4") and always ship
 * with an icon or label — color never carries state alone.
 */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#898781",
} as const;

export type StatusTone = keyof typeof STATUS;

/** Chart chrome on the dark card surface. */
export const CHROME = {
  surface: "#18181b",
  grid: "#2c2c2a",
  baseline: "#383835",
  mutedInk: "#898781",
  secondaryInk: "#c3c2b7",
  primaryInk: "#ffffff",
  deltaGood: "#0ca30c",
} as const;

/** Shared axis props for recharts. */
export const axisProps = {
  tick: { fill: CHROME.mutedInk, fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};
