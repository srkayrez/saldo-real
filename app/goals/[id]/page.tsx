import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { CancelGoalButton } from "@/components/finance/cancel-goal-button";
import { MoneyValue, PageHeader, StatusBadge } from "@/components/finance/finance-ui";
import { GoalContributionForm } from "@/components/finance/goal-contribution-form";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { formatDate } from "@/lib/finance/format";
import { getGoal } from "@/lib/finance/goals/data";

type Props = { params: Promise<{ id: string }> };

async function Content({ params }: Props) {
  const [workspace, route] = await Promise.all([getActiveWorkspace(), params]);
  if (!workspace) return <main className="p-6">Nenhum workspace disponível.</main>;
  const detail = await getGoal(workspace.id, route.id);
  if (!detail) notFound();
  const { goal, contributions } = detail;
  const canEdit = workspace.role !== "viewer";
  const editable = canEdit && goal.effectiveStatus !== "cancelled";

  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
    <PageHeader title={goal.name} description="Acompanhamento de objetivo financeiro" action={<div className="flex gap-2"><Button asChild variant="outline"><Link href="/goals">Voltar</Link></Button>{editable && <Button asChild><Link href={`/goals/${goal.id}/edit`}>Editar</Link></Button>}</div>} />
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex justify-between gap-4"><div><p className="text-xs text-muted-foreground">Acumulado</p><MoneyValue className="mt-1 block text-3xl font-bold" tone="income" value={goal.savedAmount} /><p className="mt-1 text-sm text-muted-foreground">Alvo <MoneyValue value={goal.target_amount} /></p></div><StatusBadge status={goal.effectiveStatus === "cancelled" ? "cancelled" : goal.effectiveStatus === "completed" ? "paid" : "active"} /></div>
      <div className="mt-6 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(goal.percentage, 100)}%` }} /></div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Progresso real</dt><dd className="font-semibold">{goal.percentage.toFixed(1)}%</dd></div><div><dt className="text-xs text-muted-foreground">Restante</dt><dd><MoneyValue className="font-semibold" value={goal.remainingAmount} /></dd></div><div><dt className="text-xs text-muted-foreground">Prazo</dt><dd className={goal.overdue ? "font-semibold text-destructive" : "font-semibold"}>{goal.target_date ? goal.overdue ? "Meta atrasada" : formatDate(goal.target_date) : "Sem prazo"}</dd></div><div><dt className="text-xs text-muted-foreground">Necessário por mês</dt><dd>{goal.requiredMonthly === null ? "—" : <MoneyValue className="font-semibold" value={goal.requiredMonthly} />}</dd></div></dl>
      {editable && <div className="mt-6 border-t pt-5"><CancelGoalButton id={goal.id} /></div>}
    </section>
    {editable && goal.effectiveStatus !== "completed" && <section className="space-y-3"><h2 className="text-xl font-semibold">Adicionar aporte</h2><GoalContributionForm goalId={goal.id} /></section>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Histórico de aportes</h2>{contributions.length ? <div className="divide-y overflow-hidden rounded-2xl border bg-card">{contributions.map((item) => <article key={item.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{formatDate(item.contribution_date)}</p><p className="text-sm text-muted-foreground">{item.notes ?? "Sem observação"}</p></div><MoneyValue className="font-bold" tone="income" value={item.amount} /></article>)}</div> : <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Nenhum aporte registrado.</p>}</section>
  </main>;
}

export default function Page(props: Props) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><Content {...props} /></Suspense></AppShell>;
}
