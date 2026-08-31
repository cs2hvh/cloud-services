/**
 * The project page's section names — and NOTHING that cannot cross a boundary.
 *
 * This file exists because of two failures in a row, and both are worth stating
 * because the type checker was happy for both.
 *
 * 1. The section table lived in the page (a server component) and was passed to
 *    the tab bar as a prop. Each entry carried a lucide icon, which is a
 *    function, and a function cannot be serialized across the server/client
 *    boundary. Every tab rendered a 500: "Functions cannot be passed directly
 *    to Client Components".
 *
 * 2. So the table moved into the tab bar, which is `"use client"`, and the page
 *    imported just the string values from it. That fails differently and more
 *    quietly: EVERYTHING exported from a client module is a client REFERENCE
 *    when a server component imports it, not the value itself. The array was a
 *    reference object, and `SECTION_VALUES.includes(...)` threw "is not a
 *    function" at request time.
 *
 * The rule underneath: a module shared by both sides must be neither. This one
 * has no `"use client"` and holds no functions, so it is importable from
 * anywhere. The icons stay in the client component with the markup that uses
 * them.
 *
 * Order matters: overview first because it answers "is it up and where";
 * settings last because it is the only section that changes anything, and a tab
 * bar that opens on a form invites editing before reading.
 */

export const SECTION_VALUES = [
  "overview",
  "deployments",
  "logs",
  "domains",
  "environment",
  "usage",
  "settings",
] as const;

export type SectionValue = (typeof SECTION_VALUES)[number];

/** Whether a `?tab=` value is one we render. */
export function isSection(value: string | undefined | null): value is SectionValue {
  return typeof value === "string" && (SECTION_VALUES as readonly string[]).includes(value);
}
