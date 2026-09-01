"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getFriendlyDatabaseError } from "@/lib/finance/errors";
import type { ActionState } from "@/types/finance";

export async function updateAccountName(_state: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Informe um nome entre 1 e 120 caracteres." };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Sua sessão expirou. Entre novamente." };
  const { error } = await supabase.auth.updateUser({ data: { full_name: name, name } });
  if (error) return { error: getFriendlyDatabaseError(error, "Não foi possível atualizar seu nome.") };
  revalidatePath("/settings");
  return { success: "Nome atualizado." };
}
