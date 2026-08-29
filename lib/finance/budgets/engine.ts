import type { Budget, MonthlyBudgetView } from "@/types/budgets";

function numberValue(value: number | string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export function calculateBudgetView(budgets: Budget[], consumption: Map<string | null, { categoryName: string; total: number }>): MonthlyBudgetView {
  const budgetCategoryIds = new Set(budgets.map((budget) => budget.category_id));
  const metrics = budgets.map((budget) => {
    const limit = numberValue(budget.limit_amount);
    const spentOrCommitted = consumption.get(budget.category_id)?.total ?? 0;
    const percentage = limit > 0 ? (spentOrCommitted / limit) * 100 : spentOrCommitted > 0 ? 100 : 0;
    return { budgetId: budget.id, categoryId: budget.category_id, categoryName: budget.category?.name ?? "Categoria", limit, percentage, remaining: limit - spentOrCommitted, spentOrCommitted, status: percentage >= 100 ? "exceeded" as const : percentage >= 80 ? "attention" as const : "normal" as const };
  }).sort((a, b) => b.percentage - a.percentage);
  const unbudgeted = Array.from(consumption.entries()).filter(([categoryId, value]) => categoryId !== null && value.total > 0 && !budgetCategoryIds.has(categoryId)).map(([categoryId, value]) => ({ categoryId: categoryId as string, categoryName: value.categoryName, spentOrCommitted: value.total })).sort((a, b) => b.spentOrCommitted - a.spentOrCommitted);
  const planned = metrics.reduce((sum, item) => sum + item.limit, 0);
  const used = Array.from(consumption.values()).reduce((sum, item) => sum + item.total, 0);
  return { available: planned - used, budgets: metrics, planned, unbudgeted, used };
}
