import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";
import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { EmptyState, MetricCard, MoneyValue, PageHeader, StatusBadge } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { formatDate } from "@/lib/finance/format";
import { getGoals } from "@/lib/finance/goals/data";

function CountCard({ description, label, value }: { description: string; label: string; value: number }) {
  return <article className="rounded-2xl border bg-card p-5 shadow-sm"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p><p className="mt-2 text-xs text-muted-foreground">{description}</p></article>;
}

async function Content() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return <main className="p-6">Nenhum workspace disponível.</main>;
  const summary = await getGoals(workspace.id);
  const canEdit = workspace.role !== "viewer";
  const current = summary.goals.filter((goal) => goal.effectiveStatus !== "cancelled");
  const cancelled = summary.goals.filter((goal) => goal.effectiveStatus === "cancelled");
  return <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
    <PageHeader title="Metas" description={`Objetivos financeiros de ${workspace.name}`} action={canEdit ? <Button asChild><Link href="/goals/new"><Plus /> Nova meta</Link></Button> : undefined} />
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <CountCard label="Metas ativas" description="Em andamento" value={summary.active} />
      <MetricCard label="Total alvo" description="Metas não canceladas" value={summary.target} />
      <MetricCard label="Total acumulado" description="Alocação lógica" tone="income" value={summary.saved} />
      <CountCard label="Concluídas" description="Alvo atingido" value={summary.completed} />
    </section>
    {current.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{current.map((goal) => <article key={goal.id} className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{goal.name}</h2><StatusBadge status={goal.effectiveStatus === "completed" ? "paid" : "active"} /></div>
      <p className="mt-4 text-xs text-muted-foreground">Acumulado</p><MoneyValue className="mt-1 block text-2xl font-bold" tone="income" value={goal.savedAmount} /><p className="mt-1 text-sm text-muted-foreground">de <MoneyValue value={goal.target_amount} /></p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(goal.percentage, 100)}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{goal.percentage.toFixed(0)}%</span><span>Restante <MoneyValue value={goal.remainingAmount} /></span></div>
      {goal.target_date && <p className={`mt-4 text-sm ${goal.overdue ? "text-destructive" : "text-muted-foreground"}`}>{goal.overdue ? "Meta atrasada" : `Prazo: ${formatDate(goal.target_date)}`}</p>}
      <Button asChild className="mt-5 w-full" variant="outline"><Link href={`/goals/${goal.id}`}>Ver meta</Link></Button>
    </article>)}</section> : <div className="rounded-2xl border bg-card"><EmptyState title="Nenhuma meta ativa" description="Crie um objetivo e acompanhe seus aportes." action={canEdit ? <Button asChild><Link href="/goals/new">Criar meta</Link></Button> : undefined} /></div>}
    {cancelled.length > 0 && <section className="space-y-3"><h2 className="text-xl font-semibold">Histórico cancelado</h2><div className="grid gap-3 sm:grid-cols-2">{cancelled.map((goal) => <Link className="rounded-xl border bg-card p-4 hover:bg-muted/50" href={`/goals/${goal.id}`} key={goal.id}><p className="font-medium">{goal.name}</p><p className="text-sm text-muted-foreground">Acumulado: <MoneyValue value={goal.savedAmount} /></p></Link>)}</div></section>}
  </main>;
}
export default function Page() { return <AppShell><Suspense fallback={<FinancePageLoading />}><Content /></Suspense></AppShell>; }
