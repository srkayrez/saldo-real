import { calculateCurrentBalance } from "@/lib/finance/dashboard";
import { getTodayInSaoPaulo } from "@/lib/finance/date";
import { calculateForecast, forecastHorizonEnd } from "@/lib/finance/forecast/engine";
import { ensureRecurrenceWindow } from "@/lib/finance/recurrences/data";
import { createClient } from "@/lib/supabase/server";
import type { Account, Transaction } from "@/types/finance";
import type { FinancialForecast, ForecastEvent } from "@/types/forecast";

type ForecastTransaction = Pick<Transaction, "amount" | "description" | "id" | "origin" | "recurrence_rule_id" | "transaction_date" | "transaction_type">;
type InvoiceRow = { credit_card_id: string; due_date: string; id: string; status: string };
type InstallmentRow = { amount: number | string; invoice_id: string; status: string };

function amount(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getFinancialForecast(workspaceId: string): Promise<FinancialForecast> {
  await ensureRecurrenceWindow(workspaceId);
  const supabase = await createClient();
  const today = getTodayInSaoPaulo();
  const horizonEnd = forecastHorizonEnd(today);
  const [accountsResult, paidResult, pendingResult, invoicesResult, installmentsResult, cardsResult, rulesResult] = await Promise.all([
    supabase.from("accounts").select("initial_balance, active, include_in_balance").eq("workspace_id", workspaceId),
    supabase.from("transactions").select("amount, transaction_type").eq("workspace_id", workspaceId).eq("status", "paid"),
    supabase.from("transactions").select("id, description, amount, transaction_type, transaction_date, origin, recurrence_rule_id")
      .eq("workspace_id", workspaceId).eq("status", "pending").neq("origin", "card_invoice_payment").lt("transaction_date", horizonEnd),
    supabase.from("card_invoices").select("id, credit_card_id, due_date, status")
      .eq("workspace_id", workspaceId).neq("status", "paid").lt("due_date", horizonEnd),
    supabase.from("card_installments").select("invoice_id, amount, status").eq("workspace_id", workspaceId).neq("status", "cancelled"),
    supabase.from("credit_cards").select("id, name").eq("workspace_id", workspaceId),
    supabase.from("recurrence_rules").select("id, amount_type").eq("workspace_id", workspaceId),
  ]);
  const error = accountsResult.error ?? paidResult.error ?? pendingResult.error ?? invoicesResult.error ?? installmentsResult.error ?? cardsResult.error ?? rulesResult.error;
  if (error) throw new Error(`Não foi possível carregar a previsão: ${error.message}`);

  const currentBalance = calculateCurrentBalance(
    (accountsResult.data ?? []) as Pick<Account, "active" | "include_in_balance" | "initial_balance">[],
    (paidResult.data ?? []) as Pick<Transaction, "amount" | "transaction_type">[],
  );
  const estimatedRuleIds = new Set((rulesResult.data ?? []).filter((rule) => rule.amount_type === "estimated").map((rule) => rule.id));
  const cards = new Map((cardsResult.data ?? []).map((card) => [card.id, card.name]));
  const installmentTotals = new Map<string, number>();
  for (const installment of (installmentsResult.data ?? []) as InstallmentRow[]) {
    installmentTotals.set(installment.invoice_id, (installmentTotals.get(installment.invoice_id) ?? 0) + amount(installment.amount));
  }

  const transactionEvents: ForecastEvent[] = ((pendingResult.data ?? []) as ForecastTransaction[]).map((transaction) => ({
    amount: amount(transaction.amount), date: transaction.transaction_date, description: transaction.description,
    estimated: Boolean(transaction.recurrence_rule_id && estimatedRuleIds.has(transaction.recurrence_rule_id)),
    id: `transaction-${transaction.id}`, kind: transaction.transaction_type,
    origin: transaction.origin === "recurrence" ? "Recorrente" : "Manual",
  }));
  const invoiceEvents: ForecastEvent[] = ((invoicesResult.data ?? []) as InvoiceRow[])
    .map((invoice) => ({
      amount: installmentTotals.get(invoice.id) ?? 0, date: invoice.due_date,
      description: `Fatura ${cards.get(invoice.credit_card_id) ?? "Cartão"}`, estimated: false,
      id: `invoice-${invoice.id}`, kind: "card_invoice" as const, origin: "Fatura" as const,
    })).filter((event) => event.amount > 0);

  return calculateForecast(currentBalance, [...transactionEvents, ...invoiceEvents], today);
}
