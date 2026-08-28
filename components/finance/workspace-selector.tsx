"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setActiveWorkspace } from "@/actions/workspaces";
import type { WorkspaceSummary } from "@/types/finance";

type Props = {
  activeWorkspaceId: string;
  selectorId?: string;
  workspaces: WorkspaceSummary[];
};

export function WorkspaceSelector({
  activeWorkspaceId,
  selectorId = "active-workspace",
  workspaces,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function handleChange(workspaceId: string) {
    setError(undefined);
    startTransition(async () => {
      try {
        await setActiveWorkspace(workspaceId);
        router.refresh();
      } catch {
        setError("Não foi possível trocar o workspace.");
      }
    });
  }

  return (
    <div className="w-full min-w-0">
      <label htmlFor={selectorId} className="block text-[11px] font-medium text-muted-foreground">
        Espaço atual
      </label>
      <select
        id={selectorId}
        aria-label="Workspace ativo"
        className="mt-1 h-10 w-full rounded-lg border bg-card px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-ring focus:ring-offset-2"
        disabled={pending}
        onChange={(event) => handleChange(event.target.value)}
        value={activeWorkspaceId}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
