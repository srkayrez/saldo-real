import { createClient } from "@/lib/supabase/server";
import { ensureRecurrenceWindow } from "@/lib/finance/recurrences/data";
import { getNextMonthStart } from "@/lib/finance/date";
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
  await ensureRecurrenceWindow(workspaceId);
  const supabase = await createClient();
  const [transactionsResult, accountsResult] = await Promise.all([supabase
    .from("transactions")
    .select(`
      id,
      workspace_id,
      account_id,
      category_id,
      created_at,
      description,
      amount,
      transaction_type,
      transaction_date,
      paid_date,
      status,
      notes,
      origin,
      recurrence_rule_id,
      recurrence_reference_month,
      card_invoice_id,
      category:categories(name)
    `)
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false }),
  supabase.from("accounts").select("id, name").eq("workspace_id", workspaceId)]);

  const error = transactionsResult.error ?? accountsResult.error;
  if (error) {
    throw new Error(`Não foi possível carregar as movimentações: ${error.message}`);
  }

  const accounts = new Map((accountsResult.data ?? []).map((account) => [account.id, { name: account.name }]));
  const nextMonthStart = getNextMonthStart();
  return ((transactionsResult.data ?? []) as unknown as Omit<Transaction, "account">[])
    .map((transaction) => ({ ...transaction, account: accounts.get(transaction.account_id) ?? null }))
    .filter((transaction) => !(
      transaction.origin === "recurrence"
      && transaction.status === "pending"
      && transaction.transaction_date >= nextMonthStart
    ));
}

export async function getTransaction(workspaceId: string, transactionId: string): Promise<Transaction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(`
      id, workspace_id, account_id, category_id, created_at, description, amount,
      transaction_type, transaction_date, paid_date, status, notes, origin,
      card_invoice_id, recurrence_rule_id, recurrence_reference_month, category:categories(name)
    `)
    .eq("id", transactionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a movimentação: ${error.message}`);
  if (!data) return null;

  const transaction = data as unknown as Transaction;
  const { data: account, error: accountError } = await supabase.from("accounts")
    .select("name").eq("id", transaction.account_id).eq("workspace_id", workspaceId).maybeSingle();
  if (accountError) throw new Error(`Não foi possível carregar a conta relacionada: ${accountError.message}`);
  transaction.account = account;
  if (transaction.card_invoice_id) {
    const { data: invoice, error: invoiceError } = await supabase
      .from("card_invoices")
      .select("credit_card_id, reference_month")
      .eq("id", transaction.card_invoice_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (invoiceError) throw new Error(`Não foi possível carregar a fatura relacionada: ${invoiceError.message}`);
    transaction.invoice = invoice;
  }
  return transaction;
}
