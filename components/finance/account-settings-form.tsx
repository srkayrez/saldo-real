"use client";

import { useActionState } from "react";

import { updateAccountName } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/types/finance";

const initialState: ActionState = {};

export function AccountSettingsForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState(updateAccountName, initialState);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="account-name">Nome</Label>
        <Input id="account-name" name="name" defaultValue={initialName} maxLength={120} required />
      </div>
      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700" role="status">{state.success}</p>}
      <Button disabled={pending} type="submit">{pending ? "Salvando..." : "Salvar nome"}</Button>
    </form>
  );
}
