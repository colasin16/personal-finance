import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SAMPLE_MONTHS,
  buildSampleStatements,
  renderSampleStatementPdf,
  sampleFileName,
} from "../src/lib/dev/sample-statements";

const outDir = path.join(process.cwd(), "samples");
await mkdir(outDir, { recursive: true });

for (const statement of buildSampleStatements(SAMPLE_MONTHS)) {
  const file = path.join(outDir, sampleFileName(statement));
  await writeFile(file, await renderSampleStatementPdf(statement));
  console.log(`✓ ${path.relative(process.cwd(), file)} (${statement.rows.length} rows)`);
}
