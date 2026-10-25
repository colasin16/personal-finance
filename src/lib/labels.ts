export const ACCOUNT_TYPES = [
  { value: "checking", label: "Current account" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit card" },
  { value: "investment", label: "Investment" },
] as const;

export const accountTypeLabel = (type: string) => ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;

export const STATEMENT_STATUS: Record<string, { label: string; className: string }> = {
  uploaded: { label: "Queued", className: "bg-slate-100 text-slate-700" },
  processing: { label: "Processing", className: "bg-sky-100 text-sky-700" },
  needs_account: { label: "Pick account", className: "bg-amber-100 text-amber-800" },
  needs_review: { label: "Ready to review", className: "bg-violet-100 text-violet-700" },
  confirmed: { label: "Confirmed", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
};

export const CATEGORIZED_BY: Record<string, string> = {
  rule: "Your rule",
  merchant: "Learned from past choices",
  llm: "Auto-categorized",
  user: "Set manually",
  transfer: "Transfer between your accounts",
};

export const formatMonth = (month: string, style: "short" | "long" = "short") =>
  new Date(`${month.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: style, year: style === "long" ? "numeric" : "2-digit" });

export const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
