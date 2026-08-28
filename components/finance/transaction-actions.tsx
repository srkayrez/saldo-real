"use client";

import { useActionState } from "react";
import Link from "next/link";

import { cancelTransaction, markTransactionPaid } from "@/actions/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTodayInSaoPaulo } from "@/lib/finance/date";

export function TransactionActions({ compact = false, transactionId }: { compact?: boolean; transactionId: string }) {
  const [paymentState, paymentAction, paying] = useActionState(markTransactionPaid, {});
  const [cancelState, cancelAction, cancelling] = useActionState(cancelTransaction, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline"><Link href={`/transactions/${transactionId}`}>Ver</Link></Button>
        <Button asChild size="sm" variant="outline"><Link href={`/transactions/${transactionId}/edit`}>Editar</Link></Button>
        <details className="group">
          <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90">
            Marcar como paga
          </summary>
          <form action={paymentAction} className="mt-2 flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
            <input type="hidden" name="transaction_id" value={transactionId} />
            <label className="text-xs font-medium" htmlFor={`paid-date-${transactionId}`}>Data do pagamento</label>
            <Input id={`paid-date-${transactionId}`} name="paid_date" type="date" defaultValue={getTodayInSaoPaulo()} required />
            <Button size="sm" type="submit" disabled={paying}>{paying ? "Salvando..." : "Confirmar"}</Button>
          </form>
        </details>
        <form action={cancelAction}>
          <input type="hidden" name="transaction_id" value={transactionId} />
          <Button size="sm" type="submit" variant="destructive" disabled={cancelling}>
            {cancelling ? "Cancelando..." : "Cancelar"}
          </Button>
        </form>
      </div>
      {(paymentState.error || cancelState.error) && <p className="text-xs text-destructive" role="alert">{paymentState.error ?? cancelState.error}</p>}
      {!compact && (paymentState.success || cancelState.success) && <p className="text-xs text-finance-income" role="status">{paymentState.success ?? cancelState.success}</p>}
    </div>
  );
}
