"use client";

import { useActionState } from "react";

import { createCardPurchase } from "@/actions/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/types/finance";

const selectClass = "h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function CardPurchaseForm({
  cardId,
  categories,
}: {
  cardId: string;
  categories: Category[];
}) {
  const [state, action, pending] = useActionState(createCardPurchase, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
      <input type="hidden" name="credit_card_id" value={cardId} />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="purchase-description">Descrição</Label>
        <Input id="purchase-description" name="description" maxLength={200} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="purchase-amount">Valor total</Label>
        <Input id="purchase-amount" name="total_amount" type="number" min="0.01" step="0.01" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="installment-count">Número de parcelas</Label>
        <Input id="installment-count" name="installment_count" type="number" min="1" max="360" defaultValue="1" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="purchase-date">Data da compra</Label>
        <Input id="purchase-date" name="purchase_date" type="date" defaultValue={today} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="purchase-category">Categoria</Label>
        <select id="purchase-category" name="category_id" className={selectClass}>
          <option value="">Sem categoria</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="purchase-notes">Observação</Label>
        <textarea id="purchase-notes" name="notes" rows={4} className="w-full rounded-lg border bg-card px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
      </div>
      <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto" type="submit" disabled={pending}>
          {pending ? "Gerando parcelas..." : "Registrar compra"}
        </Button>
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        {state.success && <p className="text-sm text-finance-income" role="status">{state.success}</p>}
      </div>
    </form>
  );
}
