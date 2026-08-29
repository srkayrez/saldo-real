"use server";

import { revalidatePath } from "next/cache";

import {
  getActiveWorkspace,
  requireWorkspaceEditor,
} from "@/lib/finance/context";
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
    const { error } = await supabase.from("accounts").insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name,
      account_type: accountType,
      initial_balance: initialBalance,
      active: true,
    });

    if (error) {
      return { error: `Não foi possível criar a conta: ${error.message}` };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro inesperado." };
  }

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  return { success: "Conta criada com sucesso." };
}
