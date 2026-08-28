"use client";
import { useActionState } from "react";
import { createRecurrence, updateRecurrence } from "@/actions/recurrences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTodayInSaoPaulo } from "@/lib/finance/date";
import type { Account, Category, RecurrenceRule } from "@/types/finance";

const fieldClass = "flex h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
export function RecurrenceForm({ accounts, categories, rule }: { accounts: Account[]; categories: Category[]; rule?: RecurrenceRule }) {
  const [state, action, pending] = useActionState(rule ? updateRecurrence : createRecurrence, {});
  return <form action={action} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
    {rule && <input type="hidden" name="recurrence_id" value={rule.id} />}
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="name">Nome</Label><Input id="name" name="name" defaultValue={rule?.name} maxLength={200} required /></div>
    <div className="space-y-2"><Label htmlFor="transaction_type">Tipo</Label><select id="transaction_type" name="transaction_type" className={fieldClass} defaultValue={rule?.transaction_type ?? "expense"}><option value="expense">Despesa</option><option value="income">Receita</option></select></div>
    <div className="space-y-2"><Label htmlFor="amount">Valor</Label><Input id="amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={rule ? Number(rule.amount) : undefined} required /></div>
    <div className="space-y-2"><Label htmlFor="amount_type">Tipo do valor</Label><select id="amount_type" name="amount_type" className={fieldClass} defaultValue={rule?.amount_type ?? "fixed"}><option value="fixed">Fixo</option><option value="estimated">Estimado</option></select></div>
    <div className="space-y-2"><Label htmlFor="day_of_month">Dia do mês</Label><Input id="day_of_month" name="day_of_month" type="number" min="1" max="31" defaultValue={rule?.day_of_month} required /></div>
    <div className="space-y-2"><Label htmlFor="account_id">Conta</Label><select id="account_id" name="account_id" className={fieldClass} defaultValue={rule?.account_id ?? ""} required><option value="">Selecione</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="category_id">Categoria</Label><select id="category_id" name="category_id" className={fieldClass} defaultValue={rule?.category_id ?? ""}><option value="">Sem categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="start_date">Data inicial</Label><Input id="start_date" name="start_date" type="date" defaultValue={rule?.start_date ?? getTodayInSaoPaulo()} required /></div>
    <div className="space-y-2"><Label htmlFor="end_date">Data final (opcional)</Label><Input id="end_date" name="end_date" type="date" defaultValue={rule?.end_date ?? ""} /></div>
    <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center"><Button type="submit" disabled={pending || accounts.length === 0}>{pending ? "Salvando..." : rule ? "Salvar regra" : "Criar recorrência"}</Button>{state.error && <p className="text-sm text-destructive">{state.error}</p>}{state.success && <p className="text-sm text-finance-income">{state.success}</p>}</div>
  </form>;
}
