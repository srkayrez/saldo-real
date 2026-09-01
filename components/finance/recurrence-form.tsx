"use client";
import { useActionState, useState } from "react";
import { createRecurrence, updateRecurrence } from "@/actions/recurrences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTodayInSaoPaulo } from "@/lib/finance/date";
import type { CreditCard } from "@/types/cards";
import type { Account, Category, RecurrenceRule, TransactionType } from "@/types/finance";
const fieldClass = "flex h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
export function RecurrenceForm({ accounts, cards, categories, rule }: { accounts: Account[]; cards: CreditCard[]; categories: Category[]; rule?: RecurrenceRule }) {
  const [state, action, pending] = useActionState(rule ? updateRecurrence : createRecurrence, {});
  const [transactionType, setTransactionType] = useState<TransactionType>(rule?.transaction_type ?? "expense");
  const [paymentMethod, setPaymentMethod] = useState(rule?.payment_method ?? "account");
  const effectiveMethod = transactionType === "income" ? "account" : paymentMethod;
  return <form action={action} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
    {rule && <input type="hidden" name="recurrence_id" value={rule.id} />}<input type="hidden" name="payment_method" value={effectiveMethod} />
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="name">Nome</Label><Input id="name" name="name" defaultValue={rule?.name} maxLength={200} required /></div>
    <div className="space-y-2"><Label htmlFor="transaction_type">Tipo</Label><select id="transaction_type" name="transaction_type" className={fieldClass} value={transactionType} onChange={(event) => setTransactionType(event.target.value as TransactionType)}><option value="expense">Despesa</option><option value="income">Receita</option></select></div>
    <div className="space-y-2"><Label htmlFor="amount">Valor</Label><Input id="amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={rule ? Number(rule.amount) : undefined} required /></div>
    {transactionType === "expense" && <div className="space-y-2"><Label htmlFor="payment_method_select">Forma de pagamento</Label><select id="payment_method_select" className={fieldClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "account" | "credit_card")}><option value="account">Conta</option><option value="credit_card">Cartão de crédito</option></select></div>}
    {effectiveMethod === "account" ? <div className="space-y-2"><Label htmlFor="account_id">Conta</Label><select id="account_id" name="account_id" className={fieldClass} defaultValue={rule?.account_id ?? ""} required><option value="">Selecione</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div> : <div className="space-y-2"><Label htmlFor="credit_card_id">Cartão</Label><select id="credit_card_id" name="credit_card_id" className={fieldClass} defaultValue={rule?.credit_card_id ?? ""} required><option value="">Selecione</option>{cards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
    <div className="space-y-2"><Label htmlFor="amount_type">Tipo do valor</Label><select id="amount_type" name="amount_type" className={fieldClass} defaultValue={rule?.amount_type ?? "fixed"}><option value="fixed">Fixo</option><option value="estimated">Estimado</option></select></div>
    <div className="space-y-2"><Label htmlFor="day_of_month">Dia do mês</Label><Input id="day_of_month" name="day_of_month" type="number" min="1" max="31" defaultValue={rule?.day_of_month} required /></div>
    <div className="space-y-2"><Label htmlFor="category_id">Categoria</Label><select id="category_id" name="category_id" className={fieldClass} defaultValue={rule?.category_id ?? ""}><option value="">Sem categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="start_date">Data inicial</Label><Input id="start_date" name="start_date" type="date" defaultValue={rule?.start_date ?? getTodayInSaoPaulo()} required /></div>
    <div className="space-y-2"><Label htmlFor="end_date">Data final (opcional)</Label><Input id="end_date" name="end_date" type="date" defaultValue={rule?.end_date ?? ""} /></div>
    {effectiveMethod === "credit_card" && <p className="text-sm text-muted-foreground sm:col-span-2">Cada mês gera uma compra independente de uma parcela. Compras já materializadas não são recalculadas.</p>}
    <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center"><Button type="submit" disabled={pending || (effectiveMethod === "account" ? accounts.length === 0 : cards.length === 0)}>{pending ? "Salvando..." : rule ? "Salvar regra" : "Criar recorrência"}</Button>{state.error && <p className="text-sm text-destructive">{state.error}</p>}{state.success && <p className="text-sm text-finance-income">{state.success}</p>}</div>
  </form>;
}
