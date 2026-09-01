"use server";

import { revalidatePath } from "next/cache";
import { getActiveWorkspace, requireWorkspaceEditor as requireWorkspaceMembership } from "@/lib/finance/context";
import { ensureRecurrenceWindow } from "@/lib/finance/recurrences/data";
import { isValidIsoDate } from "@/lib/finance/date";
import { getFriendlyActionError, getFriendlyDatabaseError } from "@/lib/finance/errors";
import type { ActionState, TransactionType } from "@/types/finance";

function parse(formData: FormData) {
  const value = {
    name: String(formData.get("name") ?? "").trim(),
    transactionType: String(formData.get("transaction_type") ?? "") as TransactionType,
    paymentMethod: String(formData.get("payment_method") ?? "account"),
    amount: Number(formData.get("amount")), amountType: String(formData.get("amount_type") ?? ""),
    categoryId: String(formData.get("category_id") ?? "") || null,
    accountId: String(formData.get("account_id") ?? "") || null,
    creditCardId: String(formData.get("credit_card_id") ?? "") || null, dayOfMonth: Number(formData.get("day_of_month")),
    startDate: String(formData.get("start_date") ?? ""), endDate: String(formData.get("end_date") ?? "") || null,
  };
  if (!value.name || value.name.length > 200) return { error: "Informe um nome válido." } as const;
  if (!Number.isFinite(value.amount) || value.amount <= 0) return { error: "Informe um valor maior que zero." } as const;
  if (!["income", "expense"].includes(value.transactionType)) return { error: "Selecione um tipo válido." } as const;
  if (!["fixed", "estimated"].includes(value.amountType)) return { error: "Selecione o tipo do valor." } as const;
  if (!Number.isInteger(value.dayOfMonth) || value.dayOfMonth < 1 || value.dayOfMonth > 31) return { error: "O dia deve estar entre 1 e 31." } as const;
  if (!isValidIsoDate(value.startDate) || (value.endDate && (!isValidIsoDate(value.endDate) || value.endDate < value.startDate))) return { error: "Informe um período com datas válidas." } as const;
  if (!['account', 'credit_card'].includes(value.paymentMethod)) return { error: "Selecione uma forma de pagamento válida." } as const;
  if (value.transactionType === "income" && value.paymentMethod !== "account") return { error: "Receitas recorrentes devem utilizar uma conta." } as const;
  if (value.paymentMethod === "account" && !value.accountId) return { error: "Selecione uma conta." } as const;
  if (value.paymentMethod === "credit_card" && !value.creditCardId) return { error: "Selecione um cartão de crédito." } as const;
  return { value } as const;
}

async function validateRelations(workspaceId: string, accountId: string | null, creditCardId: string | null, categoryId: string | null) {
  const context = await requireWorkspaceMembership(workspaceId);
  const { supabase } = context;
  if (accountId) {
    const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).eq("workspace_id", workspaceId).eq("active", true).maybeSingle();
    if (!account) throw new Error("A conta é inválida, inativa ou pertence a outro workspace.");
  }
  if (creditCardId) {
    const { data: card } = await supabase.from("credit_cards").select("id").eq("id", creditCardId).eq("workspace_id", workspaceId).eq("active", true).maybeSingle();
    if (!card) throw new Error("O cartão é inválido, inativo ou pertence a outro workspace.");
  }
  if (categoryId) {
    const { data: category } = await supabase.from("categories").select("id").eq("id", categoryId).eq("workspace_id", workspaceId).eq("active", true).maybeSingle();
    if (!category) throw new Error("A categoria é inválida, inativa ou pertence a outro workspace.");
  }
  return context;
}

function paths(id?: string) { revalidatePath("/recurrences"); revalidatePath("/transactions"); revalidatePath("/dashboard"); if (id) revalidatePath(`/recurrences/${id}`); }

export async function createRecurrence(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parse(formData); if ("error" in parsed) return parsed;
  try {
    const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase, user } = await validateRelations(workspace.id, parsed.value.accountId, parsed.value.creditCardId, parsed.value.categoryId);
    const { error } = await supabase.from("recurrence_rules").insert({ workspace_id: workspace.id, created_by: user.id, name: parsed.value.name, transaction_type: parsed.value.transactionType, payment_method: parsed.value.paymentMethod, amount: parsed.value.amount, amount_type: parsed.value.amountType, frequency: "monthly", category_id: parsed.value.categoryId, account_id: parsed.value.paymentMethod === "account" ? parsed.value.accountId : null, credit_card_id: parsed.value.paymentMethod === "credit_card" ? parsed.value.creditCardId : null, day_of_month: parsed.value.dayOfMonth, start_date: parsed.value.startDate, end_date: parsed.value.endDate });
    if (error) return { error: getFriendlyDatabaseError(error, "Não foi possível criar a recorrência.") };
    await ensureRecurrenceWindow(workspace.id);
  } catch (error) { return { error: getFriendlyActionError(error, "Não foi possível criar a recorrência.") }; }
  paths(); return { success: "Recorrência criada e ocorrências geradas." };
}

export async function updateRecurrence(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("recurrence_id") ?? ""); const parsed = parse(formData);
  if (!id) return { error: "Recorrência inválida." }; if ("error" in parsed) return parsed;
  try {
    const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await validateRelations(workspace.id, parsed.value.accountId, parsed.value.creditCardId, parsed.value.categoryId);
    const { data: rule } = await supabase.from("recurrence_rules").select("id").eq("id", id).eq("workspace_id", workspace.id).maybeSingle(); if (!rule) return { error: "Recorrência inexistente ou inacessível." };
    const { error } = await supabase.from("recurrence_rules").update({ name: parsed.value.name, transaction_type: parsed.value.transactionType, payment_method: parsed.value.paymentMethod, amount: parsed.value.amount, amount_type: parsed.value.amountType, category_id: parsed.value.categoryId, account_id: parsed.value.paymentMethod === "account" ? parsed.value.accountId : null, credit_card_id: parsed.value.paymentMethod === "credit_card" ? parsed.value.creditCardId : null, day_of_month: parsed.value.dayOfMonth, start_date: parsed.value.startDate, end_date: parsed.value.endDate }).eq("id", id).eq("workspace_id", workspace.id);
    if (error) return { error: getFriendlyDatabaseError(error, "Não foi possível atualizar a recorrência.") };
    await ensureRecurrenceWindow(workspace.id);
  } catch (error) { return { error: getFriendlyActionError(error, "Não foi possível atualizar a recorrência.") }; }
  paths(id); return { success: "Regra atualizada. Ocorrências existentes foram preservadas." };
}

export async function deactivateRecurrence(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("recurrence_id") ?? ""); if (!id) return { error: "Recorrência inválida." };
  try { const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." }; const { supabase } = await requireWorkspaceMembership(workspace.id); const { error } = await supabase.from("recurrence_rules").update({ active: false }).eq("id", id).eq("workspace_id", workspace.id).eq("active", true); if (error) return { error: getFriendlyDatabaseError(error, "Não foi possível desativar a recorrência.") }; }
  catch (error) { return { error: getFriendlyActionError(error, "Não foi possível desativar a recorrência.") }; }
  paths(id); return { success: "Recorrência desativada. As ocorrências existentes foram mantidas." };
}
