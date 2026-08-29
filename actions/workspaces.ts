"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { headers } from "next/headers";

import {
  ACTIVE_WORKSPACE_COOKIE,
  getActiveWorkspace,
  requireWorkspaceMembership,
  requireWorkspaceOwner,
} from "@/lib/finance/context";
import type { ActionState } from "@/types/finance";

async function persistActiveWorkspace(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true, maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  await requireWorkspaceMembership(workspaceId);

  await persistActiveWorkspace(workspaceId);

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/cards");
  revalidatePath("/transactions");
  revalidatePath("/transactions/new");
}

export async function createWorkspace(_state: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { error: "Informe um nome válido." };
  try {
    const { supabase } = await requireWorkspaceMembership((await getActiveWorkspace())?.id ?? "");
    const { data, error } = await supabase.rpc("create_shared_workspace", { p_name: name });
    if (error || !data) return { error: `Não foi possível criar o espaço: ${error?.message ?? "resposta inválida"}` };
    await persistActiveWorkspace(data as string);
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; }
  revalidatePath("/", "layout");
  return { success: "Espaço compartilhado criado e ativado." };
}

export async function createWorkspaceInvitation(_state: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  try {
    const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." };
    const { supabase } = await requireWorkspaceOwner(workspace.id);
    const { data, error } = await supabase.rpc("create_workspace_invitation", { p_workspace_id: workspace.id, p_email: email, p_role: role });
    if (error || !data?.[0]?.token) return { error: `Não foi possível criar o convite: ${error?.message ?? "resposta inválida"}` };
    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
    const protocol = headerStore.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
    const origin = `${protocol}://${host}`;
    return { success: "Convite criado. Compartilhe o link abaixo.", inviteUrl: `${origin}/invite/${data[0].token}` };
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; }
}

export async function acceptWorkspaceInvitation(_state: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  try {
    const workspace = await getActiveWorkspace();
    const { supabase } = workspace ? await requireWorkspaceMembership(workspace.id) : (() => { throw new Error("Autenticação necessária."); })();
    const { data, error } = await supabase.rpc("accept_workspace_invitation", { p_token: token });
    if (error || !data) return { error: `Não foi possível aceitar o convite: ${error?.message ?? "resposta inválida"}` };
    await persistActiveWorkspace(data as string); revalidatePath("/", "layout");
    return { success: "Convite aceito. O novo espaço está ativo." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; }
}

export async function updateMemberRole(_state: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("user_id") ?? ""); const role = String(formData.get("role") ?? "");
  try { const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." }; const { supabase } = await requireWorkspaceOwner(workspace.id); const { error } = await supabase.rpc("update_workspace_member_role", { p_workspace_id: workspace.id, p_user_id: userId, p_role: role }); if (error) return { error: error.message }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; } revalidatePath("/settings/workspace"); return { success: "Permissão atualizada." };
}

export async function removeMember(_state: ActionState, formData: FormData): Promise<ActionState> {
  const userId = String(formData.get("user_id") ?? "");
  try { const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." }; const { supabase } = await requireWorkspaceMembership(workspace.id); const { error } = await supabase.rpc("remove_workspace_member", { p_workspace_id: workspace.id, p_user_id: userId }); if (error) return { error: error.message }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; } revalidatePath("/", "layout"); return { success: "Membro removido do espaço." };
}

export async function renameWorkspace(_state: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  try { const workspace = await getActiveWorkspace(); if (!workspace) return { error: "Nenhum workspace disponível." }; const { supabase } = await requireWorkspaceOwner(workspace.id); const { error } = await supabase.rpc("rename_workspace", { p_workspace_id: workspace.id, p_name: name }); if (error) return { error: error.message }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Erro inesperado." }; } revalidatePath("/", "layout"); return { success: "Nome atualizado." };
}
