"use server";

import { revalidatePath } from "next/cache";

import { getActiveWorkspace, requireWorkspaceEditor } from "@/lib/finance/context";
import type { ActionState, TransactionStatus, TransactionType } from "@/types/finance";

const transactionTypes = new Set<TransactionType>(["income", "expense"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type TransactionInput = {
  accountId: string; amount: number; categoryId: string | null; description: string;
  notes: string | null; paidDate: string | null; status: "pending" | "paid";
  transactionDate: string; transactionType: TransactionType;
};

function parseTransactionInput(formData: FormData, editing = false): TransactionInput | { error: string } {
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const transactionType = String(formData.get("transaction_type") ?? "") as TransactionType;
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const accountId = String(formData.get("account_id") ?? "");
  const transactionDate = String(formData.get("transaction_date") ?? "");
  const status = editing ? "pending" : String(formData.get("status") ?? "") as TransactionStatus;
  const submittedPaidDate = String(formData.get("paid_date") ?? "");
  const paidDate = status === "paid" ? submittedPaidDate : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!description || description.length > 200) return { error: "Informe uma descrição válida." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "O valor deve ser maior que zero." };
  if (!transactionTypes.has(transactionType)) return { error: "Selecione um tipo válido." };
  if (status !== "pending" && status !== "paid") return { error: "Selecione um status válido." };
  if (!accountId || !datePattern.test(transactionDate)) return { error: "Informe a conta e a data financeira." };
  if (status === "paid" && (!paidDate || !datePattern.test(paidDate))) return { error: "Informe a data efetiva do pagamento." };
  return { accountId, amount, categoryId, description, notes, paidDate, status, transactionDate, transactionType };
}

async function getValidatedContext(input: TransactionInput) {
  const workspace = await getActiveWorkspace();
  if (!workspace) throw new Error("Nenhum workspace disponível.");
  const context = await requireWorkspaceEditor(workspace.id);
  const { supabase } = context;
  const { data: account } = await supabase.from("accounts").select("id")
    .eq("id", input.accountId).eq("workspace_id", workspace.id).eq("active", true).maybeSingle();
  if (!account) throw new Error("A conta selecionada não pertence a este workspace ou está inativa.");
  if (input.categoryId) {
    const { data: category } = await supabase.from("categories").select("id")
      .eq("id", input.categoryId).eq("workspace_id", workspace.id).eq("active", true).maybeSingle();
    if (!category) throw new Error("A categoria selecionada não pertence a este workspace ou está inativa.");
  }
  return { ...context, workspace };
}

function revalidateTransactionPaths(id?: string) {
  revalidatePath("/dashboard"); revalidatePath("/transactions");
  if (id) revalidatePath(`/transactions/${id}`);
}

export async function createTransaction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const input = parseTransactionInput(formData);
  if ("error" in input) return input;
  try {
    const { supabase, user, workspace } = await getValidatedContext(input);
    const { error } = await supabase.from("transactions").insert({
      account_id: input.accountId, amount: input.amount, category_id: input.categoryId,
      created_by: user.id, description: input.description, notes: input.notes,
      paid_date: input.paidDate, status: input.status, transaction_date: input.transactionDate,
      transaction_type: input.transactionType, workspace_id: workspace.id,
    });
    if (error) return { error: `Não foi possível registrar a movimentação: ${error.message}` };
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; }
  revalidateTransactionPaths();
  return { success: "Movimentação registrada com sucesso." };
}

export async function updateTransaction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("transaction_id") ?? "");
  const input = parseTransactionInput(formData, true);
  if (!id) return { error: "Movimentação inválida." };
  if ("error" in input) return input;
  try {
    const { supabase, workspace } = await getValidatedContext(input);
    const { data: transaction } = await supabase.from("transactions").select("id, origin, status")
      .eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
    if (!transaction) return { error: "Movimentação inexistente ou inacessível." };
    if (transaction.origin === "card_invoice_payment") return { error: "Pagamentos de fatura não podem ser editados manualmente." };
    if (transaction.status !== "pending") return { error: "Somente movimentações pendentes podem ser editadas." };
    const { error } = await supabase.from("transactions").update({
      account_id: input.accountId, amount: input.amount, category_id: input.categoryId,
      description: input.description, notes: input.notes, transaction_date: input.transactionDate,
      transaction_type: input.transactionType,
    }).eq("id", id).eq("workspace_id", workspace.id).neq("origin", "card_invoice_payment").eq("status", "pending");
    if (error) return { error: `Não foi possível atualizar a movimentação: ${error.message}` };
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; }
  revalidateTransactionPaths(id);
  return { success: "Movimentação atualizada com sucesso." };
}

export async function markTransactionPaid(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("transaction_id") ?? "");
  const paidDate = String(formData.get("paid_date") ?? "");
  if (!id || !datePattern.test(paidDate)) return { error: "Informe uma data de pagamento válida." };
  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await requireWorkspaceEditor(workspace.id);
    const { data: transaction } = await supabase.from("transactions").select("id, origin, status")
      .eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
    if (!transaction) return { error: "Movimentação inexistente ou inacessível." };
    if (transaction.origin === "card_invoice_payment") return { error: "Pagamentos de fatura são controlados pelo fluxo da fatura." };
    if (transaction.status !== "pending") return { error: "Somente movimentações pendentes podem ser marcadas como pagas." };
    const { error } = await supabase.from("transactions").update({ paid_date: paidDate, status: "paid" })
      .eq("id", id).eq("workspace_id", workspace.id).neq("origin", "card_invoice_payment").eq("status", "pending");
    if (error) return { error: `Não foi possível liquidar a movimentação: ${error.message}` };
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; }
  revalidateTransactionPaths(id);
  return { success: "Movimentação marcada como paga." };
}

export async function cancelTransaction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("transaction_id") ?? "");
  if (!id) return { error: "Movimentação inválida." };
  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await requireWorkspaceEditor(workspace.id);
    const { data: transaction } = await supabase.from("transactions").select("id, origin, status")
      .eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
    if (!transaction) return { error: "Movimentação inexistente ou inacessível." };
    if (transaction.origin === "card_invoice_payment") return { error: "Pagamentos de fatura não podem ser cancelados manualmente." };
    if (transaction.status !== "pending") return { error: "Somente movimentações pendentes podem ser canceladas." };
    const { error } = await supabase.from("transactions").update({ paid_date: null, status: "cancelled" })
      .eq("id", id).eq("workspace_id", workspace.id).neq("origin", "card_invoice_payment").eq("status", "pending");
    if (error) return { error: `Não foi possível cancelar a movimentação: ${error.message}` };
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; }
  revalidateTransactionPaths(id);
  return { success: "Movimentação cancelada sem apagar o histórico." };
}
