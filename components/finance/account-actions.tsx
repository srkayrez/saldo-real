"use client";

import { useActionState } from "react";
import { deleteAccount, setAccountActive } from "@/actions/accounts";
import { Button } from "@/components/ui/button";

export function AccountActions({ accountId, active }: { accountId: string; active: boolean }) {
  const [statusState, statusAction, statusPending] = useActionState(setAccountActive, {});
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAccount, {});

  return <div className="mt-4 space-y-3 border-t pt-4">
    <div className="flex flex-wrap gap-2">
      <form action={statusAction}>
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button size="sm" type="submit" variant="outline" disabled={statusPending || deletePending}>
          {statusPending ? "Salvando..." : active ? "Desativar" : "Reativar"}
        </Button>
      </form>
      <form action={deleteAction} onSubmit={(event) => { if (!window.confirm("Excluir esta conta permanentemente? Contas com vínculos financeiros não serão excluídas.")) event.preventDefault(); }}>
        <input type="hidden" name="account_id" value={accountId} />
        <Button size="sm" type="submit" variant="destructive" disabled={statusPending || deletePending}>
          {deletePending ? "Excluindo..." : "Excluir"}
        </Button>
      </form>
    </div>
    {(statusState.error || deleteState.error) && <p className="text-sm text-destructive" role="alert">{statusState.error ?? deleteState.error}</p>}
    {(statusState.success || deleteState.success) && <p className="text-sm text-finance-income" role="status">{statusState.success ?? deleteState.success}</p>}
  </div>;
}
