"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type FiltersDialog = { open: boolean; setOpen: (open: boolean) => void };

const FiltersDialogContext = createContext<FiltersDialog | null>(null);

/** Shares the mobile filters dialog between the filter bar and the list, so the sticky month header can open it. */
export function FiltersDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <FiltersDialogContext.Provider value={{ open, setOpen }}>{children}</FiltersDialogContext.Provider>;
}

/** Null outside a FiltersDialogProvider, i.e. on lists without filters. */
export const useFiltersDialog = () => useContext(FiltersDialogContext);

/** From/to count as one filter, as they are shown as a single date range. */
export const activeFilterCount = (params: URLSearchParams) =>
  ["account", "category", "flagged", "statement"].filter((k) => params.get(k)).length + (params.get("from") || params.get("to") ? 1 : 0);
