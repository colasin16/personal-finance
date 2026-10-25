import type { Db } from "./index";
import { banks, categories } from "./schema";

export const BANKS = [
  { id: "ing", name: "ING", country: "ES", color: "#ff6200", detectKeywords: ["ING BANK", "ING DIRECT", "INGDESMM"] },
  { id: "bbva", name: "BBVA", country: "ES", color: "#004481", detectKeywords: ["BBVA", "BBVAESMM"] },
  { id: "santander", name: "Banco Santander", country: "ES", color: "#ec0000", detectKeywords: ["SANTANDER", "BSCHESMM"] },
  { id: "caixabank", name: "CaixaBank", country: "ES", color: "#007eae", detectKeywords: ["CAIXABANK", "CAIXESBB"] },
  { id: "sabadell", name: "Banco Sabadell", country: "ES", color: "#006dff", detectKeywords: ["SABADELL", "BSABESBB"] },
  { id: "bankinter", name: "Bankinter", country: "ES", color: "#ff6600", detectKeywords: ["BANKINTER", "BKBKESMM"] },
  { id: "openbank", name: "Openbank", country: "ES", color: "#ec0000", detectKeywords: ["OPENBANK", "OPENESMM"] },
  { id: "unicaja", name: "Unicaja", country: "ES", color: "#00843d", detectKeywords: ["UNICAJA", "UCJAES2M"] },
  { id: "kutxabank", name: "Kutxabank", country: "ES", color: "#e2001a", detectKeywords: ["KUTXABANK", "BASKES2B"] },
  { id: "abanca", name: "Abanca", country: "ES", color: "#0d4ea6", detectKeywords: ["ABANCA", "CAGLESMM"] },
  { id: "revolut", name: "Revolut", country: "LT", color: "#191c1f", detectKeywords: ["REVOLUT", "REVOLT21"] },
  { id: "n26", name: "N26", country: "DE", color: "#36a18b", detectKeywords: ["N26", "NTSBDEB1"] },
  { id: "wise", name: "Wise", country: "BE", color: "#9fe870", detectKeywords: ["WISE EUROPE", "TRWIBEB1"] },
  { id: "myinvestor", name: "MyInvestor", country: "ES", color: "#00c2a8", detectKeywords: ["MYINVESTOR"] },
  { id: "other", name: "Other bank", country: "—", color: "#64748b", detectKeywords: [] },
];

export async function seedBanks(db: Db) {
  for (const bank of BANKS) {
    await db
      .insert(banks)
      .values(bank)
      .onConflictDoUpdate({ target: banks.id, set: { name: bank.name, color: bank.color, detectKeywords: bank.detectKeywords } });
  }
}

type SeedCategory = {
  slug: string;
  name: string;
  kind: "expense" | "income" | "transfer";
  icon: string;
  color: string;
  /** Hints used by the offline (mock) categorizer. */
  keywords: string[];
};

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { slug: "housing", name: "Housing", kind: "expense", icon: "home", color: "#6366f1", keywords: ["ALQUILER", "HIPOTECA", "RENT", "COMUNIDAD", "IBI"] },
  { slug: "utilities", name: "Utilities", kind: "expense", icon: "zap", color: "#f59e0b", keywords: ["IBERDROLA", "ENDESA", "NATURGY", "HOLALUZ", "AGUA", "CANAL DE ISABEL", "MOVISTAR", "VODAFONE", "ORANGE", "DIGI", "FIBRA", "GAS"] },
  { slug: "groceries", name: "Groceries", kind: "expense", icon: "shopping-basket", color: "#22c55e", keywords: ["MERCADONA", "CARREFOUR", "LIDL", "ALDI", "DIA ", "EROSKI", "CONSUM", "ALCAMPO", "BONPREU", "SUPERMERCADO", "AHORRAMAS", "FRUTERIA", "CONDIS"] },
  { slug: "restaurants", name: "Restaurants & bars", kind: "expense", icon: "utensils", color: "#f97316", keywords: ["RESTAURANTE", "BAR ", "CAFE", "CAFETERIA", "GLOVO", "JUST EAT", "UBER EATS", "DELIVEROO", "BURGER", "MCDONALD", "TELEPIZZA", "STARBUCKS", "TABERNA", "PIZZ"] },
  { slug: "transport", name: "Transport", kind: "expense", icon: "train-front", color: "#0ea5e9", keywords: ["RENFE", "METRO", "EMT", "TMB", "CABIFY", "UBER", "BOLT", "FREENOW", "ALSA", "BICING", "TAXI", "IRYO", "OUIGO"] },
  { slug: "car", name: "Car & fuel", kind: "expense", icon: "car", color: "#64748b", keywords: ["REPSOL", "CEPSA", "GALP", "SHELL", "BP ", "GASOLINERA", "PARKING", "APARCAMIENTO", "PEAJE", "AUTOPISTA", "ITV", "TALLER"] },
  { slug: "health", name: "Health", kind: "expense", icon: "heart-pulse", color: "#ef4444", keywords: ["FARMACIA", "CLINICA", "HOSPITAL", "DENTAL", "SANITAS", "ADESLAS", "DKV", "OPTICA", "FISIO"] },
  { slug: "sports", name: "Sports", kind: "expense", icon: "dumbbell", color: "#14b8a6", keywords: ["GYM", "GIMNASIO", "DECATHLON", "BASIC FIT", "ALTAFIT", "DIR ", "PADEL", "MCFIT", "CROSSFIT"] },
  { slug: "education", name: "Education", kind: "expense", icon: "graduation-cap", color: "#8b5cf6", keywords: ["UNIVERSIDAD", "ACADEMIA", "UDEMY", "COURSERA", "COLEGIO", "ESCUELA", "LIBRERIA"] },
  { slug: "shopping", name: "Shopping", kind: "expense", icon: "shopping-bag", color: "#ec4899", keywords: ["AMAZON", "ZARA", "EL CORTE INGLES", "IKEA", "PRIMARK", "MANGO", "H&M", "FNAC", "MEDIA MARKT", "MEDIAMARKT", "ALIEXPRESS", "LEROY MERLIN", "SHEIN", "PULL&BEAR"] },
  { slug: "leisure", name: "Leisure & travel", kind: "expense", icon: "plane", color: "#06b6d4", keywords: ["RYANAIR", "VUELING", "IBERIA", "BOOKING", "AIRBNB", "HOTEL", "CINE", "TEATRO", "TICKETMASTER", "MUSEO", "EASYJET"] },
  { slug: "subscriptions", name: "Subscriptions", kind: "expense", icon: "repeat", color: "#a855f7", keywords: ["NETFLIX", "SPOTIFY", "HBO", "MAX ", "DISNEY", "PRIME VIDEO", "APPLE.COM", "ICLOUD", "GOOGLE", "YOUTUBE", "CHATGPT", "OPENAI", "DAZN", "FILMIN", "VIAPLAY"] },
  { slug: "insurance", name: "Insurance", kind: "expense", icon: "shield", color: "#0f766e", keywords: ["SEGURO", "MAPFRE", "MUTUA", "LINEA DIRECTA", "ALLIANZ", "AXA", "GENERALI", "OCASO"] },
  { slug: "taxes", name: "Taxes & fees", kind: "expense", icon: "landmark", color: "#78716c", keywords: ["AEAT", "AGENCIA TRIBUTARIA", "HACIENDA", "AYUNTAMIENTO", "COMISION", "TASA", "IMPUESTO", "DGT", "MULTA"] },
  { slug: "kids", name: "Kids", kind: "expense", icon: "baby", color: "#fb7185", keywords: ["GUARDERIA", "JUGUETES", "TOYS", "KIABI"] },
  { slug: "pets", name: "Pets", kind: "expense", icon: "paw-print", color: "#a16207", keywords: ["VETERINARI", "TIENDANIMAL", "KIWOKO", "MASCOTA"] },
  { slug: "gifts", name: "Gifts & donations", kind: "expense", icon: "gift", color: "#d946ef", keywords: ["DONACION", "ONG", "CRUZ ROJA", "UNICEF", "REGALO"] },
  { slug: "cash", name: "Cash withdrawals", kind: "expense", icon: "banknote", color: "#84cc16", keywords: ["CAJERO", "RETIRADA", "REINTEGRO", "ATM"] },
  { slug: "other-expenses", name: "Other expenses", kind: "expense", icon: "circle-ellipsis", color: "#94a3b8", keywords: [] },
  { slug: "salary", name: "Salary", kind: "income", icon: "briefcase", color: "#16a34a", keywords: ["NOMINA", "SALARY", "PAYROLL", "HABERES"] },
  { slug: "other-income", name: "Other income", kind: "income", icon: "coins", color: "#4ade80", keywords: ["DEVOLUCION", "REEMBOLSO", "INTERESES", "ABONO", "BIZUM RECIBIDO", "REFUND", "DIVIDENDO"] },
  { slug: "savings", name: "Savings & investments", kind: "transfer", icon: "piggy-bank", color: "#0891b2", keywords: ["INDEXA", "MYINVESTOR", "FONDO", "BROKER", "TRADE REPUBLIC", "PLAN DE PENSIONES"] },
  { slug: "transfers", name: "Transfers between accounts", kind: "transfer", icon: "arrow-left-right", color: "#475569", keywords: ["TRASPASO", "TRANSFERENCIA INTERNA", "ENTRE CUENTAS"] },
];

export async function seedHouseholdCategories(db: Db, householdId: string) {
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map(({ slug, name, kind, icon, color }) => ({ householdId, slug, name, kind, icon, color })),
    )
    .onConflictDoNothing();
}
