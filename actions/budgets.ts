"use server";
import { revalidatePath } from "next/cache";
import { getActiveWorkspace, requireWorkspaceMembership } from "@/lib/finance/context";
import type { ActionState } from "@/types/finance";

function validMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function paths(month?: string) { revalidatePath("/budgets"); if (month) revalidatePath(`/budgets?month=${month}`); }

export async function createBudget(_state: ActionState, formData: FormData): Promise<ActionState> {
  const categoryId = String(formData.get("category_id") ?? ""); const month = String(formData.get("month") ?? ""); const limit = Number(formData.get("limit_amount"));
  if (!categoryId || !validMonth(month)) return { error: "Informe categoria e mês válidos." }; if (!Number.isFinite(limit) || limit < 0) return { error: "O limite não pode ser negativo." };
  try { const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." }; const { supabase, user } = await requireWorkspaceMembership(workspace.id); const { data: category } = await supabase.from("categories").select("id").eq("id", categoryId).eq("workspace_id", workspace.id).eq("active", true).maybeSingle(); if (!category) return { error: "A categoria é inválida ou pertence a outro workspace." }; const { error } = await supabase.from("budgets").insert({ workspace_id: workspace.id, category_id: categoryId, reference_month: `${month}-01`, limit_amount: limit, created_by: user.id }); if (error?.code === "23505") return { error: "Esta categoria já possui orçamento no mês selecionado." }; if (error) return { error: `Não foi possível criar o orçamento: ${error.message}` }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; } paths(month); return { success: "Orçamento criado com sucesso." };
}

export async function updateBudget(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("budget_id") ?? ""); const limit = Number(formData.get("limit_amount")); if (!id || !Number.isFinite(limit) || limit < 0) return { error: "Informe um limite válido." };
  try { const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." }; const { supabase } = await requireWorkspaceMembership(workspace.id); const { data: budget } = await supabase.from("budgets").select("id, reference_month").eq("id", id).eq("workspace_id", workspace.id).maybeSingle(); if (!budget) return { error: "Orçamento inexistente ou inacessível." }; const { error } = await supabase.from("budgets").update({ limit_amount: limit }).eq("id", id).eq("workspace_id", workspace.id); if (error) return { error: `Não foi possível atualizar: ${error.message}` }; paths(budget.reference_month.slice(0, 7)); }
  catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; } return { success: "Limite atualizado. Categoria e mês foram preservados." };
}

export async function deleteBudget(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("budget_id") ?? ""); if (!id) return { error: "Orçamento inválido." };
  try { const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." }; const { supabase } = await requireWorkspaceMembership(workspace.id); const { error } = await supabase.from("budgets").delete().eq("id", id).eq("workspace_id", workspace.id); if (error) return { error: `Não foi possível remover: ${error.message}` }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; } paths(); return { success: "Orçamento removido. Nenhuma movimentação foi alterada." };
}
