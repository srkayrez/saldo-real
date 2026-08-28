import { createClient } from "@/lib/supabase/server";
import type { RecurrenceRule, Transaction } from "@/types/finance";

export async function ensureRecurrenceWindow(workspaceId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_recurrence_occurrences", { p_workspace_id: workspaceId });
  if (error) throw new Error(`Não foi possível gerar as ocorrências: ${error.message}`);
}

export async function getRecurrenceRules(workspaceId: string): Promise<RecurrenceRule[]> {
  await ensureRecurrenceWindow(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("recurrence_rules")
    .select("id, workspace_id, name, transaction_type, category_id, account_id, amount, amount_type, frequency, day_of_month, start_date, end_date, active, created_at, account:accounts(name), category:categories(name)")
    .eq("workspace_id", workspaceId).order("active", { ascending: false }).order("created_at");
  if (error) throw new Error(`Não foi possível carregar as recorrências: ${error.message}`);
  return (data ?? []) as unknown as RecurrenceRule[];
}

export async function getRecurrenceRule(workspaceId: string, id: string): Promise<RecurrenceRule | null> {
  await ensureRecurrenceWindow(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("recurrence_rules")
    .select("id, workspace_id, name, transaction_type, category_id, account_id, amount, amount_type, frequency, day_of_month, start_date, end_date, active, created_at, account:accounts(name), category:categories(name)")
    .eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a recorrência: ${error.message}`);
  return data as unknown as RecurrenceRule | null;
}

export async function getRecurrenceOccurrences(workspaceId: string, ruleId: string): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("transactions")
    .select("id, workspace_id, account_id, category_id, created_at, description, amount, transaction_type, transaction_date, paid_date, status, notes, origin, card_invoice_id, recurrence_rule_id, recurrence_reference_month, account:accounts(name), category:categories(name)")
    .eq("workspace_id", workspaceId).eq("recurrence_rule_id", ruleId).order("transaction_date");
  if (error) throw new Error(`Não foi possível carregar as ocorrências: ${error.message}`);
  return (data ?? []) as unknown as Transaction[];
}
