import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type SampleAccount = {
  key: "alex-ing" | "sam-bbva" | "shared-ing";
  bank: "ing" | "bbva";
  name: string;
  iban: string;
  owners: ("alex" | "sam")[];
  opening: number; // cents at the start of the first month
};

export const SAMPLE_ACCOUNTS: SampleAccount[] = [
  { key: "alex-ing", bank: "ing", name: "Cuenta Nómina Alex", iban: "ES76 1465 0100 9123 4567 8901", owners: ["alex"], opening: 352_040 },
  { key: "sam-bbva", bank: "bbva", name: "Cuenta Online Sam", iban: "ES12 0182 1234 5612 3456 7890", owners: ["sam"], opening: 418_575 },
  { key: "shared-ing", bank: "ing", name: "Cuenta Común", iban: "ES45 1465 0100 9876 5432 1098", owners: ["alex", "sam"], opening: 120_000 },
];

export type SampleRow = { date: string; description: string; amount: number };
export type SampleStatement = {
  account: SampleAccount;
  year: number;
  month: number; // 1-12
  opening: number;
  closing: number;
  rows: (SampleRow & { balance: number })[];
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function monthRows(account: SampleAccount, year: number, month: number): SampleRow[] {
  const rand = mulberry32(year * 100 + month + account.key.length * 7919);
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const rows: SampleRow[] = [];
  const add = (d: number, description: string, amount: number) => rows.push({ date: iso(year, month, d), description, amount });

  if (account.key === "alex-ing") {
    add(1, "NOMINA ACME SOFTWARE SL", 285_000);
    add(2, "TRANSFERENCIA A CUENTA COMUN GASTOS HOGAR", -90_000);
    add(3, "RECIBO VODAFONE ESPANA SAU", -4_599);
    add(5, "COMPRA TARJ. 4821 SPOTIFY P1A2B3", -1_199);
    for (let i = 0; i < 4; i++) add(between(6, 27), "COMPRA TARJ. 4821 RESTAURANTE LA TAGLIATELLA", -between(1_800, 6_500));
    for (let i = 0; i < 3; i++) add(between(4, 28), "COMPRA TARJ. 4821 CABIFY MADRID", -between(900, 2_400));
    add(between(8, 12), "COMPRA TARJ. 4821 REPSOL ESTACION 2231", -between(5_000, 7_500));
    add(between(10, 20), "COMPRA TARJ. 4821 AMAZON EU SARL", -between(1_500, 9_000));
    add(15, "RECIBO BASIC FIT SPAIN SAU", -2_999);
    add(between(14, 25), "BIZUM ENVIADO A MARTA CENA", -between(1_500, 3_000));
    add(between(16, 26), "COMPRA TARJ. 4821 BODEGA EL RINCON DE PEPE", -between(1_200, 2_800));
    add(between(16, 26), "COMPRA TARJ. 4821 BODEGA EL RINCON DE PEPE", -between(1_200, 2_800));
    add(25, "TRASPASO A MYINVESTOR INDEXADOS", -30_000);
    if (month === 7) add(between(10, 14), "COMPRA TARJ. 4821 RYANAIR DAC", -24_380);
    if (month === 8) add(between(3, 9), "COMPRA TARJ. 4821 HOTEL MIRAMAR MALAGA", -48_600);
    if (month === 9) add(between(18, 22), "COMPRA TARJ. 4821 MEDIA MARKT VALENCIA", -64_900);
  }

  if (account.key === "sam-bbva") {
    add(28, "NOMINA HOSPITAL CLINICO UNIVERSITARIO", 262_000);
    add(3, "TRANSFERENCIA A CUENTA COMUN GASTOS HOGAR", -90_000);
    add(4, "ADEUDO SANITAS SA DE SEGUROS", -6_520);
    add(6, "PAGO TARJETA NETFLIX.COM", -1_399);
    for (let i = 0; i < 3; i++) add(between(5, 27), "PAGO TARJETA ZARA ESPANA", -between(1_999, 7_999));
    for (let i = 0; i < 3; i++) add(between(5, 27), "PAGO TARJETA STARBUCKS COFFEE", -between(450, 980));
    add(between(7, 20), "PAGO TARJETA FARMACIA LDA CENTRO", -between(800, 3_200));
    add(between(9, 21), "PAGO TARJETA RENFE VIAJEROS", -between(2_000, 7_500));
    add(between(12, 24), "PAGO TARJETA DECATHLON ESPANA", -between(1_500, 6_000));
    add(between(10, 20), "BIZUM RECIBIDO DE ALEX CENA", between(1_500, 3_000));
    add(between(12, 22), "PAGO TARJETA LIBRERIA CASA DEL LIBRO", -between(1_200, 3_500));
    add(between(14, 26), "PAGO TARJETA YOGA STUDIO SHANTI", -4_500);
    if (month === 6) add(15, "DEVOLUCION AEAT IRPF 2025", 61_240);
    if (month === 10) add(between(8, 12), "PAGO TARJETA EL CORTE INGLES", -18_950);
  }

  if (account.key === "shared-ing") {
    add(2, "TRANSFERENCIA DE ALEX GASTOS HOGAR", 90_000);
    add(3, "TRANSFERENCIA DE SAM GASTOS HOGAR", 90_000);
    add(5, "RECIBO ALQUILER INMOBILIARIA SOL", -110_000);
    add(8, "RECIBO IBERDROLA CLIENTES SAU", -between(4_500, 9_800));
    add(12, "RECIBO CANAL DE ISABEL II", -between(2_200, 3_400));
    add(20, "RECIBO MAPFRE SEGUROS HOGAR", -2_810);
    for (let i = 0; i < 5; i++) add(between(1, 28), "COMPRA TARJ. 7731 MERCADONA VALENCIA", -between(3_500, 11_000));
    for (let i = 0; i < 2; i++) add(between(1, 28), "COMPRA TARJ. 7731 LIDL SUPERMERCADOS", -between(1_500, 4_500));
    add(between(10, 25), "COMPRA TARJ. 7731 IKEA VALENCIA", -between(2_000, 12_000));
    add(between(15, 25), "COMPRA TARJ. 7731 GLOVO APP", -between(1_800, 3_800));
    add(between(5, 25), "COMPRA TARJ. 7731 TIENDANIMAL", -between(2_500, 4_900));
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function buildSampleStatements(months: { year: number; month: number }[]): SampleStatement[] {
  const result: SampleStatement[] = [];
  for (const account of SAMPLE_ACCOUNTS) {
    let balance = account.opening;
    for (const { year, month } of months) {
      const opening = balance;
      const rows = monthRows(account, year, month).map((row) => {
        balance += row.amount;
        return { ...row, balance };
      });
      result.push({ account, year, month, opening, closing: balance, rows });
    }
  }
  return result;
}

const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function fmtEs(cents: number, { unsigned = false } = {}): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (unsigned) return formatted;
  return cents < 0 ? `-${formatted}` : formatted;
}

const ddmmyyyy = (date: string, short = false) => {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${short ? y!.slice(2) : y}`;
};

/** Renders a statement as a text-based PDF mimicking the bank's layout (fictitious data). */
export async function renderSampleStatementPdf(statement: SampleStatement): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // Fixed metadata keeps the output byte-identical, so re-uploads are detected as duplicates.
  const issued = new Date(Date.UTC(statement.year, statement.month, 1));
  pdf.setCreationDate(issued);
  pdf.setModificationDate(issued);
  pdf.setProducer("personal-finance sample generator");
  pdf.setCreator("personal-finance");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { account, year, month } = statement;
  const isIng = account.bank === "ing";
  const start = iso(year, month, 1);
  const end = iso(year, month, lastDay(year, month));
  const holder = account.owners.map((o) => (o === "alex" ? "ALEX GARCIA LOPEZ" : "SAM MARTIN RUIZ")).join(" / ");
  const brand = isIng ? rgb(1, 0.38, 0) : rgb(0, 0.27, 0.51);
  const rowsPerPage = 32;
  const pagesNeeded = Math.max(1, Math.ceil(statement.rows.length / rowsPerPage));

  for (let p = 0; p < pagesNeeded; p++) {
    const page = pdf.addPage([595, 842]);
    let y = 800;
    const text = (s: string, x: number, size = 9, f = font, color = rgb(0.1, 0.1, 0.1)) =>
      page.drawText(s, { x, y, size, font: f, color });
    const right = (s: string, xRight: number, size = 9, f = font) => text(s, xRight - f.widthOfTextAtSize(s, size), size, f);

    page.drawRectangle({ x: 0, y: 815, width: 595, height: 27, color: brand });
    y = 824;
    text(isIng ? "ING BANK N.V., Sucursal en España" : "BBVA - Banco Bilbao Vizcaya Argentaria, S.A.", 40, 11, bold, rgb(1, 1, 1));
    y = 790;
    text(isIng ? "Extracto de cuenta" : "Extracto mensual de movimientos", 40, 14, bold);
    right(`Página ${p + 1} de ${pagesNeeded}`, 555);
    y -= 18;
    text(`Titular: ${holder}`, 40);
    y -= 13;
    text(`IBAN: ${account.iban}`, 40);
    y -= 13;
    text(
      isIng
        ? `Periodo: ${ddmmyyyy(start)} - ${ddmmyyyy(end)}`
        : `Extracto del ${start.split("-").reverse().join("-")} al ${end.split("-").reverse().join("-")}`,
      40,
    );
    y -= 13;
    text(`Producto: ${account.name}`, 40);
    y -= 24;

    if (p === 0) {
      text(isIng ? "Saldo anterior" : "Saldo inicial", 40, 10, bold);
      right(`${fmtEs(statement.opening)} €`, 555, 10, bold);
      y -= 20;
    }

    page.drawLine({ start: { x: 40, y: y + 12 }, end: { x: 555, y: y + 12 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    if (isIng) {
      text("F. Operación", 40, 8, bold);
      text("F. Valor", 105, 8, bold);
      text("Concepto", 165, 8, bold);
      right("Importe", 480, 8, bold);
      right("Saldo", 555, 8, bold);
    } else {
      text("Fecha", 40, 8, bold);
      text("Concepto", 100, 8, bold);
      right("Cargo/Abono", 480, 8, bold);
      right("Saldo", 555, 8, bold);
    }
    y -= 16;

    for (const row of statement.rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage)) {
      if (isIng) {
        text(ddmmyyyy(row.date), 40, 8);
        text(ddmmyyyy(row.date), 105, 8);
        text(row.description, 165, 8);
        right(fmtEs(row.amount), 480, 8);
        right(fmtEs(row.balance), 555, 8);
      } else {
        // BBVA style: short dates and unsigned amounts (the sign must be inferred from the balance).
        text(ddmmyyyy(row.date, true), 40, 8);
        text(row.description, 100, 8);
        right(fmtEs(row.amount, { unsigned: true }), 480, 8);
        right(fmtEs(row.balance), 555, 8);
      }
      y -= 15;
    }

    if (p === pagesNeeded - 1) {
      y -= 10;
      text(isIng ? "Saldo final" : "Saldo al cierre", 40, 10, bold);
      right(`${fmtEs(statement.closing)} €`, 555, 10, bold);
    }
    y = 40;
    text("Documento generado para pruebas. Datos ficticios.", 40, 7, font, rgb(0.5, 0.5, 0.5));
  }

  return pdf.save();
}

export function sampleFileName(statement: SampleStatement) {
  return `${statement.account.bank}-${statement.account.key}-${statement.year}-${String(statement.month).padStart(2, "0")}.pdf`;
}

export const SAMPLE_MONTHS = [5, 6, 7, 8, 9, 10].map((month) => ({ year: 2026, month }));
