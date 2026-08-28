import { createClient } from "@/lib/supabase/server";
import type { Account, Category, Transaction } from "@/types/finance";

export async function getAccounts(workspaceId: string): Promise<Account[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, workspace_id, name, account_type, initial_balance, active, include_in_balance, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar as contas: ${error.message}`);
  }

  return (data ?? []) as Account[];
}

export async function getActiveAccounts(workspaceId: string): Promise<Account[]> {
  const accounts = await getAccounts(workspaceId);
  return accounts.filter((account) => account.active);
}

export async function getCategories(workspaceId: string): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, workspace_id, name, kind, active")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar as categorias: ${error.message}`);
  }

  return (data ?? []) as Category[];
}

export async function getTransactions(workspaceId: string): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id,
      description,
      amount,
      transaction_type,
      transaction_date,
      status,
      notes,
      account:accounts(name),
      category:categories(name)
    `)
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Não foi possível carregar as movimentações: ${error.message}`);
  }

  return (data ?? []) as unknown as Transaction[];
}
