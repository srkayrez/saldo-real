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
import { createClient } from "@/lib/supabase/server";
import { getFriendlyActionError, getFriendlyDatabaseError } from "@/lib/finance/errors";

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Sua sessão expirou. Entre novamente.");
  return supabase;
}

async function getApplicationOrigin() {
  const configuredUrl = process.env.APP_URL?.trim();
  if (configuredUrl) {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("APP_URL deve utilizar http ou https.");
    return url.origin;
  }
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) throw new Error("Não foi possível determinar a URL da aplicação.");
  return `https://${host}`;
}

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
    const supabase = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("create_shared_workspace", { p_name: name });
    if (error || !data) return { error: getFriendlyDatabaseError(error, "Não foi possível criar o espaço.") };
    await persistActiveWorkspace(data as string);
  } catch (error) { return { error: getFriendlyActionError(error, "Não foi possível criar o espaço.") }; }
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
    if (error || !data?.[0]?.token) return { error: getFriendlyDatabaseError(error, "Não foi possível criar o convite.") };
    const origin = await getApplicationOrigin();
    return { success: "Convite criado. Compartilhe o link abaixo.", inviteUrl: `${origin}/invite/${data[0].token}` };
  } catch (error) { return { error: getFriendlyActionError(error, "Não foi possível criar o convite.") }; }
}

export async function acceptWorkspaceInvitation(_state: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  try {
    const supabase = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("accept_workspace_invitation", { p_token: token });
    if (error || !data) return { error: getFriendlyDatabaseError(error, "Não foi possível aceitar o convite.") };
    await persistActiveWorkspace(data as string); revalidatePath("/", "layout");
    return { success: "Convite aceito. O novo espaço está ativo." };
  } catch (error) { return { error: getFriendlyActionError(error, "Não foi possível aceitar o convite.") }; }
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
