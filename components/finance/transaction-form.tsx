"use client";

import { useActionState, useState } from "react";

import { createTransaction, updateTransaction } from "@/actions/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTodayInSaoPaulo } from "@/lib/finance/date";
import type { Account, Category, Transaction } from "@/types/finance";

type Props = { accounts: Account[]; categories: Category[]; transaction?: Transaction };

const fieldClass = "flex h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function TransactionForm({ accounts, categories, transaction }: Props) {
  const editing = Boolean(transaction);
  const [state, action, pending] = useActionState(editing ? updateTransaction : createTransaction, {});
  const [status, setStatus] = useState<"paid" | "pending">(
    transaction?.status === "paid" ? "paid" : "pending",
  );
  const today = getTodayInSaoPaulo();

  return (
    <form action={action} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
      {transaction && <input type="hidden" name="transaction_id" value={transaction.id} />}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="description">Descrição</Label>
        <Input id="description" name="description" maxLength={200} defaultValue={transaction?.description} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Valor</Label>
        <Input id="amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={transaction ? Number(transaction.amount) : undefined} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="transaction_type">Tipo</Label>
        <select id="transaction_type" name="transaction_type" className={fieldClass} defaultValue={transaction?.transaction_type ?? "income"} required>
          <option value="income">Receita</option>
          <option value="expense">Despesa</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="category_id">Categoria</Label>
        <select id="category_id" name="category_id" className={fieldClass} defaultValue={transaction?.category_id ?? ""}>
          <option value="">Sem categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="account_id">Conta</Label>
        <select id="account_id" name="account_id" className={fieldClass} defaultValue={transaction?.account_id ?? ""} required>
          <option value="">Selecione uma conta</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="transaction_date">Data financeira / vencimento</Label>
        <Input id="transaction_date" name="transaction_date" type="date" defaultValue={transaction?.transaction_date ?? today} required />
      </div>
      {!editing && <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <select id="status" name="status" className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value as "paid" | "pending")} required>
          <option value="pending">Pendente</option><option value="paid">Pago</option>
        </select>
      </div>}
      {!editing && status === "paid" && <div className="space-y-2">
        <Label htmlFor="paid_date">Data efetiva do pagamento</Label>
        <Input id="paid_date" name="paid_date" type="date" defaultValue={today} required />
      </div>}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="notes">Observação</Label>
        <textarea id="notes" name="notes" rows={4} defaultValue={transaction?.notes ?? ""} className="w-full rounded-lg border bg-card px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
      </div>
      <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto" type="submit" disabled={pending || accounts.length === 0}>
          {pending ? "Salvando..." : editing ? "Salvar alterações" : "Registrar movimentação"}
        </Button>
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">Crie uma conta ativa antes de registrar movimentações.</p>}
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        {state.success && <p className="text-sm text-emerald-600" role="status">{state.success}</p>}
      </div>
    </form>
  );
}
