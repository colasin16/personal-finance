import { DEFAULT_CATEGORIES } from "@/lib/db/seed";

const DEFAULT_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.slug, c.name]));

const ES: Record<string, string> = {
  housing: "Vivienda",
  utilities: "Suministros",
  groceries: "Supermercado",
  restaurants: "Restaurantes y bares",
  transport: "Transporte",
  car: "Coche y combustible",
  health: "Salud",
  sports: "Deporte",
  education: "Educación",
  shopping: "Compras",
  leisure: "Ocio y viajes",
  subscriptions: "Suscripciones",
  insurance: "Seguros",
  taxes: "Impuestos y comisiones",
  kids: "Niños",
  pets: "Mascotas",
  gifts: "Regalos y donaciones",
  cash: "Retiradas de efectivo",
  "other-expenses": "Otros gastos",
  salary: "Nómina",
  "other-income": "Otros ingresos",
  savings: "Ahorro e inversión",
  transfers: "Traspasos entre cuentas",
};

const BY_LOCALE: Record<string, Record<string, string>> = { es: ES };

/** Built-in categories are stored in English; show them translated unless the household renamed them. */
export function localizeCategoryName(category: { slug: string; name: string }, locale: string): string {
  const translated = BY_LOCALE[locale]?.[category.slug];
  return translated && DEFAULT_NAME.get(category.slug) === category.name ? translated : category.name;
}
