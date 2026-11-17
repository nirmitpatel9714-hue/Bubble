import { createContext, useContext } from "react";

/**
 * Current settings-search query. `SettingRow` reads it to hide rows that do
 * not match, giving instant filtering inside the visible tab.
 */
export const SettingsSearchContext = createContext("");

export function useSettingsSearch(): string {
  return useContext(SettingsSearchContext);
}

/** All whitespace-separated terms must appear in the searchable text. */
export function matchesSettingsSearch(
  query: string,
  ...parts: Array<string | undefined>
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
