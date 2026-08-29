"use client";
import { useActionState } from "react";
import { createBudget, updateBudget } from "@/actions/budgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Budget } from "@/types/budgets";
import type { Category } from "@/types/finance";
const selectClass = "h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
export function BudgetForm({ budget, categories, defaultCategoryId, month }: { budget?: Budget; categories: Category[]; defaultCategoryId?: string; month: string }) {
  const [state, action, pending] = useActionState(budget ? updateBudget : createBudget, {});
  return <form action={action} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
    {budget && <input type="hidden" name="budget_id" value={budget.id} />}
    <div className="space-y-2"><Label htmlFor="category_id">Categoria</Label>{budget ? <Input value={budget.category?.name ?? "Categoria"} disabled /> : <select id="category_id" name="category_id" className={selectClass} defaultValue={defaultCategoryId ?? ""} required><option value="">Selecione</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div>
    <div className="space-y-2"><Label htmlFor="month">Mês</Label><Input id="month" name="month" type="month" defaultValue={budget?.reference_month.slice(0, 7) ?? month} disabled={Boolean(budget)} required={!budget} /></div>
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="limit_amount">Limite</Label><Input id="limit_amount" name="limit_amount" type="number" min="0" step="0.01" defaultValue={budget ? Number(budget.limit_amount) : undefined} required /></div>
    <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center"><Button disabled={pending}>{pending ? "Salvando..." : budget ? "Atualizar limite" : "Criar orçamento"}</Button>{state.error && <p className="text-sm text-destructive">{state.error}</p>}{state.success && <p className="text-sm text-finance-income">{state.success}</p>}</div>
  </form>;
}
