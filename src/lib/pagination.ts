export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** Page size from a URL param; anything not offered in the selector falls back to the default. */
export const parsePageSize = (v?: string | null) => {
  const n = Number(v);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
};

const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Page numbers to render around the current page, always including the first and last; `null` marks an ellipsis.
 * The result has a constant length once there are enough pages, so the controls don't jump around.
 */
export function pageRange(page: number, pages: number, siblings = 1): (number | null)[] {
  if (pages <= 2 * siblings + 5) return span(1, pages);
  if (page - siblings <= 3) return [...span(1, 2 * siblings + 3), null, pages];
  if (page + siblings >= pages - 2) return [1, null, ...span(pages - 2 * siblings - 2, pages)];
  return [1, null, ...span(page - siblings, page + siblings), null, pages];
}
