import { aggregateConsumptionByCategory, getMonthlyConsumptionItems, type ConsumptionInstallment, type ConsumptionTransaction } from "@/lib/finance/consumption";
import { calculateBudgetView } from "@/lib/finance/budgets/engine";
import { ensureRecurrenceWindow } from "@/lib/finance/recurrences/data";
import { createClient } from "@/lib/supabase/server";
import type { Budget, MonthlyBudgetView } from "@/types/budgets";
import type { DashboardPeriod } from "@/types/finance";

export async function getMonthlyBudgets(workspaceId: string, period: DashboardPeriod): Promise<MonthlyBudgetView> {
  await ensureRecurrenceWindow(workspaceId);
  const supabase = await createClient();
  const [budgetsResult, transactionsResult, installmentsResult] = await Promise.all([
    supabase.from("budgets").select("id, workspace_id, category_id, reference_month, limit_amount, category:categories(name)").eq("workspace_id", workspaceId).eq("reference_month", `${period.month}-01`),
    supabase.from("transactions").select("amount, category_id, transaction_type, transaction_date, status, origin, category:categories(name)").eq("workspace_id", workspaceId).gte("transaction_date", period.startDate).lt("transaction_date", period.endDate),
    supabase.from("card_installments").select("amount, status, invoice:card_invoices(reference_month), purchase:card_purchases(category_id, category:categories(name))").eq("workspace_id", workspaceId),
  ]);
  const error = budgetsResult.error ?? transactionsResult.error ?? installmentsResult.error;
  if (error) throw new Error(`Não foi possível carregar os orçamentos: ${error.message}`);
  const items = getMonthlyConsumptionItems((transactionsResult.data ?? []) as unknown as ConsumptionTransaction[], (installmentsResult.data ?? []) as unknown as ConsumptionInstallment[], period);
  return calculateBudgetView((budgetsResult.data ?? []) as unknown as Budget[], aggregateConsumptionByCategory(items));
}

export async function getBudget(workspaceId: string, id: string): Promise<Budget | null> {
  const supabase = await createClient(); const { data, error } = await supabase.from("budgets").select("id, workspace_id, category_id, reference_month, limit_amount, category:categories(name)").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o orçamento: ${error.message}`); return data as unknown as Budget | null;
}
