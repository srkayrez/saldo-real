"use client";

import { useActionState } from "react";

import { payCardInvoice } from "@/actions/cards";
import { MoneyValue } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/types/finance";

const selectClass = "h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function InvoicePaymentForm({
  accounts,
  cardId,
  defaultAccountId,
  invoiceId,
  today,
  total,
}: {
  accounts: Account[];
  cardId: string;
  defaultAccountId: string | null;
  invoiceId: string;
  today: string;
  total: number;
}) {
  const [state, action, pending] = useActionState(payCardInvoice, {});
  const validDefault = accounts.some((account) => account.id === defaultAccountId)
    ? defaultAccountId ?? ""
    : "";

  return (
    <form action={action} className="space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="credit_card_id" value={cardId} />
      <div className="rounded-xl bg-muted p-4">
        <p className="text-sm text-muted-foreground">Valor integral da fatura</p>
        <MoneyValue className="mt-1 block text-2xl font-bold" value={total} />
        <p className="mt-2 text-xs text-muted-foreground">O valor é recalculado no servidor no momento do pagamento.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invoice-payment-account">Conta para pagamento</Label>
          <select
            id="invoice-payment-account"
            name="account_id"
            className={selectClass}
            defaultValue={validDefault}
            required
          >
            <option value="">Selecione uma conta</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-payment-date">Data do pagamento</Label>
          <Input id="invoice-payment-date" name="payment_date" type="date" defaultValue={today} max={today} required />
        </div>
      </div>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto" type="submit" disabled={pending || accounts.length === 0}>
          {pending ? "Processando..." : "Confirmar pagamento integral"}
        </Button>
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta ativa disponível.</p>}
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        {state.success && <p className="text-sm text-finance-income" role="status">{state.success}</p>}
      </div>
    </form>
  );
}
