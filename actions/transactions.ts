"use server";

import { revalidatePath } from "next/cache";

import {
  getActiveWorkspace,
  requireWorkspaceMembership,
} from "@/lib/finance/context";
import type { ActionState, TransactionStatus, TransactionType } from "@/types/finance";

const transactionTypes = new Set<TransactionType>(["income", "expense"]);
const transactionStatuses = new Set<TransactionStatus>(["pending", "paid"]);

export async function createTransaction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const transactionType = String(formData.get("transaction_type") ?? "") as TransactionType;
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const accountId = String(formData.get("account_id") ?? "");
  const transactionDate = String(formData.get("transaction_date") ?? "");
  const status = String(formData.get("status") ?? "") as TransactionStatus;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!description || description.length > 200) {
    return { error: "Informe uma descrição válida." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "O valor deve ser maior que zero." };
  }
  if (!transactionTypes.has(transactionType)) {
    return { error: "Selecione um tipo válido." };
  }
  if (!transactionStatuses.has(status)) {
    return { error: "Selecione um status válido." };
  }
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
    return { error: "Informe a conta e a data da movimentação." };
  }

  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return { error: "Nenhum workspace disponível." };
    }

    const workspaceId = workspace.id;
    const { supabase, user } = await requireWorkspaceMembership(workspaceId);
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .eq("workspace_id", workspaceId)
      .eq("active", true)
      .maybeSingle();

    if (!account) {
      return { error: "A conta selecionada não pertence a este workspace ou está inativa." };
    }

    if (categoryId) {
      const { data: category } = await supabase
        .from("categories")
        .select("id")
        .eq("id", categoryId)
        .eq("workspace_id", workspaceId)
        .eq("active", true)
        .maybeSingle();

      if (!category) {
        return { error: "A categoria selecionada não pertence a este workspace ou está inativa." };
      }
    }

    const { error } = await supabase.from("transactions").insert({
      workspace_id: workspaceId,
      created_by: user.id,
      description,
      amount,
      transaction_type: transactionType,
      category_id: categoryId,
      account_id: accountId,
      transaction_date: transactionDate,
      status,
      notes,
    });

    if (error) {
      return { error: `Não foi possível registrar a movimentação: ${error.message}` };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro inesperado." };
  }

  revalidatePath("/transactions");
  return { success: "Movimentação registrada com sucesso." };
}
