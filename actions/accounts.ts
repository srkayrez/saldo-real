"use server";

import { revalidatePath } from "next/cache";

import {
  getActiveWorkspace,
  requireWorkspaceEditor,
} from "@/lib/finance/context";
import {
  getFriendlyActionError,
  getFriendlyDatabaseError,
} from "@/lib/finance/errors";
import { ACCOUNT_TYPES, type ActionState } from "@/types/finance";

const accountTypes = new Set<string>(ACCOUNT_TYPES.map((type) => type.value));

export async function createAccount(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("account_type") ?? "");
  const initialBalance = Number(formData.get("initial_balance"));

  if (!name || name.length > 120) {
    return { error: "Informe um nome de conta válido." };
  }

  if (!accountTypes.has(accountType)) {
    return { error: "Selecione um tipo de conta válido." };
  }

  if (!Number.isFinite(initialBalance)) {
    return { error: "Informe um saldo inicial válido." };
  }

  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) {
      return { error: "Nenhum workspace disponível." };
    }

    const workspaceId = workspace.id;
    const { supabase, user } = await requireWorkspaceEditor(workspaceId);
    const { data: createdAccount, error } = await supabase
      .from("accounts")
      .insert({
        workspace_id: workspaceId,
        created_by: user.id,
        name,
        account_type: accountType,
        initial_balance: initialBalance,
        active: true,
      })
      .select("id, workspace_id")
      .single();

    if (error || !createdAccount || createdAccount.workspace_id !== workspaceId) {
      return { error: getFriendlyDatabaseError(error, "Não foi possível criar a conta.") };
    }
  } catch (error) {
    return { error: getFriendlyActionError(error, "Não foi possível criar a conta.") };
  }

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/recurrences/new");
  return { success: "Conta criada com sucesso." };
}

function revalidateAccountConsumers() {
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/transactions/new");
  revalidatePath("/recurrences");
  revalidatePath("/recurrences/new");
  revalidatePath("/cards");
  revalidatePath("/forecast");
}

export async function setAccountActive(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!accountId) return { error: "Conta inválida." };

  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await requireWorkspaceEditor(workspace.id);

    if (!active) {
      const { count, error: recurrenceError } = await supabase
        .from("recurrence_rules")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .eq("account_id", accountId)
        .eq("active", true);
      if (recurrenceError) return { error: getFriendlyDatabaseError(recurrenceError, "Não foi possível verificar os vínculos da conta.") };
      if ((count ?? 0) > 0) return { error: "Desative ou altere as recorrências ativas vinculadas antes de desativar esta conta." };
    }

    const { data, error } = await supabase.from("accounts")
      .update({ active }).eq("id", accountId).eq("workspace_id", workspace.id)
      .select("id").maybeSingle();
    if (error || !data) return { error: getFriendlyDatabaseError(error, "Não foi possível atualizar a conta.") };
  } catch (error) {
    return { error: getFriendlyActionError(error, "Não foi possível atualizar a conta.") };
  }

  revalidateAccountConsumers();
  return { success: active ? "Conta reativada." : "Conta desativada. O histórico foi preservado." };
}

export async function deleteAccount(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  if (!accountId) return { error: "Conta inválida." };

  try {
    const workspace = await getActiveWorkspace();
    if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await requireWorkspaceEditor(workspace.id);
    const { data, error } = await supabase.from("accounts")
      .delete().eq("id", accountId).eq("workspace_id", workspace.id)
      .select("id").maybeSingle();
    if (error) return { error: getFriendlyDatabaseError(error, "Esta conta possui vínculos financeiros e não pode ser excluída. Você pode desativá-la.") };
    if (!data) return { error: "Conta inexistente ou inacessível." };
  } catch (error) {
    return { error: getFriendlyActionError(error, "Não foi possível excluir a conta.") };
  }

  revalidateAccountConsumers();
  return { success: "Conta excluída." };
}
