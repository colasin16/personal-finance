/** Accepts `#rgb`/`#rrggbb` with or without the hash (case-insensitive). */
export const HEX_PATTERN = "#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})";

/** Normalises user input to `#rrggbb`, or null when it isn't a valid hex colour. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().match(new RegExp(`^${HEX_PATTERN}$`));
  if (!m) return null;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return `#${hex.toLowerCase()}`;
}

/** A random colour with enough saturation and mid lightness to read well as a tint and as text. */
export function randomColor(): string {
  const h = Math.random() * 360;
  const s = 0.55 + Math.random() * 0.3;
  const l = 0.45 + Math.random() * 0.15;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Black or white, whichever reads better on the given `#rrggbb` background. */
export function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? "#000" : "#fff";
}
