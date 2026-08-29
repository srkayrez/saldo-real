export type Budget = { category: { name: string } | null; category_id: string; id: string; limit_amount: number | string; reference_month: string; workspace_id: string };
export type BudgetMetric = { budgetId: string; categoryId: string; categoryName: string; limit: number; percentage: number; remaining: number; spentOrCommitted: number; status: "attention" | "exceeded" | "normal" };
export type UnbudgetedConsumption = { categoryId: string; categoryName: string; spentOrCommitted: number };
export type MonthlyBudgetView = { available: number; budgets: BudgetMetric[]; planned: number; unbudgeted: UnbudgetedConsumption[]; used: number };
