export type WorkspaceRole = "editor" | "owner" | "viewer";
export type WorkspaceMember = { display_name: string; email: string; role: WorkspaceRole; user_id: string };
export type WorkspaceInvitationInfo = { expires_at: string; invited_email: string; role: "editor" | "viewer"; status: string; workspace_name: string };
