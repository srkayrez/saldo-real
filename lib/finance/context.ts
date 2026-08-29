import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSummary } from "@/types/finance";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

type WorkspaceContext = {
  activeWorkspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
};

const resolveWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id);

  if (membershipError) {
    throw new Error(
      `Não foi possível carregar os workspaces: ${membershipError.message}`,
    );
  }

  const workspaceIds = [...new Set((memberships ?? []).map((item) => item.workspace_id))];

  if (workspaceIds.length === 0) {
    return { activeWorkspace: null, workspaces: [] };
  }

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, workspace_type, created_at")
    .in("id", workspaceIds)
    .order("created_at", { ascending: true });

  if (workspaceError) {
    throw new Error(
      `Não foi possível carregar os workspaces: ${workspaceError.message}`,
    );
  }

  const roles = new Map((memberships ?? []).map((item) => [item.workspace_id, item.role]));
  const accessibleWorkspaces = (workspaces ?? []).map(({ id, name, workspace_type }) => ({
    id,
    name,
    role: roles.get(id) as WorkspaceSummary["role"],
    workspace_type: workspace_type as WorkspaceSummary["workspace_type"],
  }));
  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const activeWorkspace =
    accessibleWorkspaces.find((workspace) => workspace.id === selectedId) ??
    accessibleWorkspaces[0] ??
    null;

  return { activeWorkspace, workspaces: accessibleWorkspaces };
});

export async function getAccessibleWorkspaces(): Promise<WorkspaceSummary[]> {
  return (await resolveWorkspaceContext()).workspaces;
}

export async function getActiveWorkspace(): Promise<WorkspaceSummary | null> {
  return (await resolveWorkspaceContext()).activeWorkspace;
}

export async function requireWorkspaceMembership(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Sua sessão expirou. Entre novamente.");
  }

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !membership) {
    throw new Error("Você não tem acesso a este workspace.");
  }

  return { membership, supabase, user };
}

export async function requireWorkspaceEditor(workspaceId: string) {
  const context = await requireWorkspaceMembership(workspaceId);
  if (context.membership.role !== "owner" && context.membership.role !== "editor") {
    throw new Error("Você possui acesso somente para visualização neste workspace.");
  }
  return context;
}

export async function requireWorkspaceOwner(workspaceId: string) {
  const context = await requireWorkspaceMembership(workspaceId);
  if (context.membership.role !== "owner") throw new Error("Somente owners podem realizar esta ação.");
  return context;
}
