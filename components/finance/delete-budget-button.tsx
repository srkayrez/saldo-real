"use client";
import { useActionState } from "react"; import { deleteBudget } from "@/actions/budgets"; import { Button } from "@/components/ui/button";
export function DeleteBudgetButton({ id }: { id: string }) { const [state, action, pending] = useActionState(deleteBudget, {}); return <form action={action}><input type="hidden" name="budget_id" value={id} /><Button size="sm" variant="destructive" disabled={pending}>{pending ? "Removendo..." : "Remover"}</Button>{state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}</form>; }
