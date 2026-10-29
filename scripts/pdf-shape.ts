/**
 * Prints the layout of a PDF with all content masked, so it can be shared safely.
 * Letters -> A/a, digits -> 9; punctuation, spacing and coordinates are kept.
 *
 * Usage: pnpm pdf:shape path/to/statement.pdf [--keep-words=Fecha,Saldo,Importe] [--pages=1,2]
 *   --keep-words: comma-separated generic header words (NOT personal data) left unmasked.
 */
import { readFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

type TextItem = { str: string; transform: number[]; width: number; fontName?: string };

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: tsx scripts/pdf-shape.ts <file.pdf> [--keep-words=a,b] [--pages=1,2]");
  process.exit(1);
}
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const keep = new Set((opt("keep-words") ?? "").split(",").filter(Boolean).map((w) => w.toLowerCase()));
const onlyPages = opt("pages")?.split(",").map(Number);

function mask(s: string): string {
  return s
    .split(/(\s+)/)
    .map((tok) => (keep.has(tok.toLowerCase()) ? tok : tok.replace(/\p{Lu}/gu, "A").replace(/\p{Ll}/gu, "a").replace(/\d/g, "9")))
    .join("");
}

const pdf = await getDocumentProxy(new Uint8Array(readFileSync(file)));
console.log(`pages=${pdf.numPages}`);

for (let n = 1; n <= pdf.numPages; n++) {
  if (onlyPages && !onlyPages.includes(n)) continue;
  const page = await pdf.getPage(n);
  const [x0, y0, x1, y1] = page.view;
  console.log(`\n=== page ${n} size=${Math.round(x1! - x0!)}x${Math.round(y1! - y0!)} ===`);
  const content = await page.getTextContent();
  const items = (content.items as TextItem[]).filter((i) => "str" in i && i.str.trim() !== "");

  const lines: { y: number; items: TextItem[] }[] = [];
  for (const item of items) {
    const y = item.transform[5]!;
    const line = lines.find((l) => Math.abs(l.y - y) < 3);
    if (line) line.items.push(item);
    else lines.push({ y, items: [item] });
  }
  lines.sort((a, b) => b.y - a.y);

  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4]! - b.transform[4]!);
    const cells = line.items.map((i) => {
      const size = Math.round(Math.hypot(i.transform[0]!, i.transform[1]!) * 10) / 10;
      return `[x=${Math.round(i.transform[4]!)} w=${Math.round(i.width)} s=${size}] ${JSON.stringify(mask(i.str))}`;
    });
    console.log(`y=${Math.round(line.y)}  ${cells.join("  ")}`);
  }
}
