import { getDocumentProxy } from "unpdf";

type TextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };

export type ExtractedPdfText = { text: string; pageCount: number; charCount: number };

/**
 * Extracts text from a text-based PDF and rebuilds visual lines from item coordinates,
 * so table rows ("date  description  amount  balance") stay on one line.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((item) => "str" in item && item.str.trim() !== "");

    const lines: { y: number; items: TextItem[] }[] = [];
    for (const item of items) {
      const y = item.transform[5]!;
      const line = lines.find((l) => Math.abs(l.y - y) < 3);
      if (line) line.items.push(item);
      else lines.push({ y, items: [item] });
    }

    lines.sort((a, b) => b.y - a.y);
    pages.push(
      lines
        .map((line) => {
          const sorted = line.items.sort((a, b) => a.transform[4]! - b.transform[4]!);
          let out = "";
          let lastEnd: number | null = null;
          for (const item of sorted) {
            const x = item.transform[4]!;
            if (lastEnd !== null) out += x - lastEnd > 12 ? "   " : x - lastEnd > 1 ? " " : "";
            out += item.str;
            lastEnd = x + item.width;
          }
          return out.trim();
        })
        .join("\n"),
    );
  }

  const text = pages.join("\n\n");
  return { text, pageCount: pages.length, charCount: text.replace(/\s/g, "").length };
}
