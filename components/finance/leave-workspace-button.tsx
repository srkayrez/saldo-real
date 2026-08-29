"use client";
import { useActionState } from "react"; import { removeMember } from "@/actions/workspaces"; import { Button } from "@/components/ui/button";
export function LeaveWorkspaceButton({ userId }: { userId: string }) { const [state, action, pending] = useActionState(removeMember, {}); return <form action={action}><input type="hidden" name="user_id" value={userId} /><Button variant="destructive" disabled={pending}>{pending ? "Saindo..." : "Sair deste espaço"}</Button>{state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}</form>; }
