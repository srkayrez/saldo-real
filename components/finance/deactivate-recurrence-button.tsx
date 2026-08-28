"use client";
import { useActionState } from "react";
import { deactivateRecurrence } from "@/actions/recurrences";
import { Button } from "@/components/ui/button";
export function DeactivateRecurrenceButton({ id }: { id: string }) { const [state, action, pending] = useActionState(deactivateRecurrence, {}); return <form action={action} className="space-y-2"><input type="hidden" name="recurrence_id" value={id} /><Button variant="destructive" disabled={pending}>{pending ? "Desativando..." : "Desativar recorrência"}</Button>{state.error && <p className="text-sm text-destructive">{state.error}</p>}{state.success && <p className="text-sm text-finance-income">{state.success}</p>}</form>; }
