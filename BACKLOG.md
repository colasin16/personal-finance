# Backlog

Upcoming work, roughly in priority order. Move an item to `PLAN.md` (or delete it) once it ships.

## 1. Income categorized as an expense category should offset that category's spending (needs investigation)

**Problem:** we pay 100 € at a restaurant, a friend sends us 50 € back (Bizum/transfer) and we categorize that income as *Restaurants*. The real restaurant spend is 50 €, but the dashboard shows 100 €. It also counts the 50 € as income.

**Today:** in `getDashboard` (`src/lib/queries.ts`, "Category ranking & top merchants") every transaction with `amount >= 0` is skipped, so the ranking, top merchants and the spending KPI only look at outflows. Income totals include any positive amount regardless of its category's kind.

**Open questions to investigate:**
- **Rule:** should a positive amount in an *expense*-kind category always be a refund/reimbursement that nets against spending, instead of counting as income? It probably should, but check how this affects the Income, Spending and Saved KPIs and the cash-flow chart, so we don't double count.
- **Negative net:** what happens when a category nets out negative for the period, i.e. more reimbursed than spent? Clamp it to 0, show it as a credit, or allow it?
- **Period boundaries:** the reimbursement may arrive in a different month or period than the expense. Net by period, or link the reimbursement to the original expense?
- **Explicit link:** would an explicit link help, like the manual transfer linking? For example, "this income reimburses that expense". It also enables partial splits, e.g. "they paid half of this dinner".
- **Shared accounts:** how does this interact with shared-account shares (`applyShare`) and per-member scopes?
- **Other views:** top merchants, the "biggest expense" markers on the net-worth chart, and the per-category transaction totals in the Transactions page should all agree.
- **UI:** show gross vs net (e.g. "100 € spent · 50 € reimbursed") in the category breakdown?
