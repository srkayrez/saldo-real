"use client";

import { useActionState, useEffect, useRef } from "react";

import { createCreditCard } from "@/actions/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/types/finance";

const selectClass = "h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function CreditCardForm({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState(createCreditCard, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="card-name">Nome</Label>
        <Input id="card-name" name="name" maxLength={120} placeholder="Ex.: Cartão principal" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="limit-amount">Limite</Label>
        <Input id="limit-amount" name="limit_amount" type="number" min="0" step="0.01" placeholder="0,00" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-account">Conta de pagamento</Label>
        <select id="payment-account" name="payment_account_id" className={selectClass}>
          <option value="">Nenhuma conta</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="closing-day">Dia de fechamento</Label>
        <Input id="closing-day" name="closing_day" type="number" min="1" max="31" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="due-day">Dia de vencimento</Label>
        <Input id="due-day" name="due_day" type="number" min="1" max="31" required />
      </div>
      <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto" type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Criar cartão"}
        </Button>
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        {state.success && <p className="text-sm text-finance-income" role="status">{state.success}</p>}
      </div>
    </form>
  );
}
