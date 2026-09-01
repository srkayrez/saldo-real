import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { BudgetMonthSelector } from "@/components/finance/budget-month-selector";
import { DeleteBudgetButton } from "@/components/finance/delete-budget-button";
import { EmptyState, MetricCard, MoneyValue, PageHeader } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getMonthlyBudgets } from "@/lib/finance/budgets/data";
import { getActiveWorkspace } from "@/lib/finance/context";
import { resolveDashboardPeriod } from "@/lib/finance/dashboard";

type Props = { searchParams: Promise<{ month?: string | string[] }> };
const statusStyle = { normal: "bg-primary", attention: "bg-amber-500", exceeded: "bg-destructive" } as const;

async function Content({ searchParams }: Props) {
  const [workspace, query] = await Promise.all([getActiveWorkspace(), searchParams]);
  if (!workspace) return <main className="p-6">Nenhum workspace disponível.</main>;
  const period = resolveDashboardPeriod(query.month);
  const view = await getMonthlyBudgets(workspace.id, period);
  const canEdit = workspace.role !== "viewer";

  return <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
    <PageHeader title="Orçamentos" description={`Planejamento de consumo de ${workspace.name}`} action={<div className="flex flex-col gap-2 sm:flex-row"><BudgetMonthSelector period={period} />{canEdit && <Button asChild><Link href={`/budgets/new?month=${period.month}`}><Plus /> Novo orçamento</Link></Button>}</div>} />
    <section className="grid gap-4 sm:grid-cols-3"><MetricCard label="Total planejado" description={period.label} value={view.planned} /><MetricCard label="Utilizado/comprometido" description="Pago e pendente nas categorias planejadas" tone="expense" value={view.used} /><MetricCard label="Disponível" description="Planejado menos utilizado" tone={view.available < 0 ? "expense" : "income"} value={view.available} /></section>
    {view.budgets.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{view.budgets.map((budget) => <article key={budget.budgetId} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{budget.categoryName}</h2><span className="text-sm font-semibold tabular-nums">{budget.percentage.toFixed(0)}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${statusStyle[budget.status]}`} style={{ width: `${Math.min(budget.percentage, 100)}%` }} /></div><dl className="mt-5 grid grid-cols-3 gap-2"><div><dt className="text-xs text-muted-foreground">Limite</dt><dd><MoneyValue className="text-sm font-semibold" value={budget.limit} /></dd></div><div><dt className="text-xs text-muted-foreground">Utilizado</dt><dd><MoneyValue className="text-sm font-semibold" tone="expense" value={budget.spentOrCommitted} /></dd></div><div><dt className="text-xs text-muted-foreground">Disponível</dt><dd><MoneyValue className="text-sm font-semibold" tone={budget.remaining < 0 ? "expense" : "income"} value={budget.remaining} /></dd></div></dl>{canEdit && <div className="mt-5 flex gap-2 border-t pt-4"><Button asChild size="sm" variant="outline"><Link href={`/budgets/${budget.budgetId}/edit`}>Editar</Link></Button><DeleteBudgetButton id={budget.budgetId} /></div>}</article>)}</section> : <div className="rounded-2xl border bg-card"><EmptyState title="Nenhum orçamento neste mês" description="Defina limites por categoria para acompanhar seu consumo." action={canEdit ? <Button asChild><Link href={`/budgets/new?month=${period.month}`}>Criar orçamento</Link></Button> : undefined} /></div>}
    {view.unbudgeted.length > 0 && <section className="space-y-4"><div><h2 className="text-xl font-semibold">Sem orçamento</h2><p className="text-sm text-muted-foreground">Categorias com consumo ou compromisso sem limite definido.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{view.unbudgeted.map((item) => <article key={item.categoryId} className="rounded-2xl border bg-card p-4 shadow-sm"><p className="font-medium">{item.categoryName}</p><p className="mt-2 text-xs text-muted-foreground">Gasto no mês</p><MoneyValue className="mt-1 block text-lg font-bold" tone="expense" value={item.spentOrCommitted} />{canEdit && <Button asChild className="mt-4" size="sm" variant="outline"><Link href={`/budgets/new?month=${period.month}&category=${item.categoryId}`}>Definir orçamento</Link></Button>}</article>)}</div></section>}
  </main>;
}

export default function Page(props: Props) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><Content {...props} /></Suspense></AppShell>;
}
