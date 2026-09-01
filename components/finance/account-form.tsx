"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createAccount } from "@/actions/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_TYPES } from "@/types/finance";

export function AccountForm() {
  const [state, action, pending] = useActionState(createAccount, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state]);

  return (
    <form ref={formRef} action={action} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-3 sm:p-6">
      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" maxLength={120} required placeholder="Ex.: Conta principal" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="account_type">Tipo da conta</Label>
        <select id="account_type" name="account_type" required className="flex h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          {ACCOUNT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="initial_balance">Saldo inicial</Label>
        <Input id="initial_balance" name="initial_balance" type="number" step="0.01" defaultValue="0.00" required />
      </div>
      <div className="flex flex-col items-start gap-3 sm:col-span-3 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto" type="submit" disabled={pending}>{pending ? "Salvando..." : "Criar conta"}</Button>
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        {state.success && <p className="text-sm text-emerald-600" role="status">{state.success}</p>}
      </div>
    </form>
  );
}
