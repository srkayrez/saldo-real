import { AlertTriangle } from "lucide-react";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { EmptyState, MoneyValue, PageHeader } from "@/components/finance/finance-ui";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getFinancialForecast } from "@/lib/finance/forecast/data";
import { formatDate } from "@/lib/finance/format";
import type { ForecastEvent } from "@/types/forecast";

function EventGroup({ events, title }: { events: ForecastEvent[]; title: string }) {
  if (!events.length) return null;
  return <div><h3 className="text-sm font-semibold">{title}</h3><ul className="mt-2 divide-y rounded-xl border">{events.map((event) => <li key={event.id} className="flex items-center justify-between gap-4 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{event.description}</p><p className="text-xs text-muted-foreground">{formatDate(event.date)} · {event.origin}{event.estimated ? " · Estimado" : ""}</p></div><MoneyValue className="shrink-0 text-sm font-semibold" tone={event.kind === "income" ? "income" : "expense"} value={event.amount} /></li>)}</ul></div>;
}

async function ForecastContent() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return <main className="mx-auto max-w-7xl p-6">Nenhum workspace disponível.</main>;
  const forecast = await getFinancialForecast(workspace.id);
  return <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
    <PageHeader title="Previsão financeira" description={`Evolução de caixa conhecida para ${workspace.name}`} />
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo da previsão">
      {forecast.months.map((month, index) => <article key={month.month} className="rounded-2xl border bg-card p-5 shadow-sm"><p className="text-sm capitalize text-muted-foreground">{month.label}</p><p className="mt-3 text-xs text-muted-foreground">{index === 0 ? "Saldo atual" : "Saldo inicial"}</p><MoneyValue className="mt-1 block font-semibold" value={month.startBalance} /><p className="mt-4 text-xs text-muted-foreground">Saldo projetado</p><MoneyValue className="mt-1 block text-2xl font-bold" tone={month.endBalance < 0 ? "expense" : "income"} value={month.endBalance} /></article>)}
    </section>
    {forecast.firstNegativeMonth && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Atenção à projeção</p><p className="text-sm">Em <span className="capitalize">{forecast.firstNegativeMonth.label}</span>, o saldo pode chegar a <MoneyValue className="font-semibold text-amber-900" value={forecast.firstNegativeMonth.lowestBalance} />.</p></div></div>}
    <div className="space-y-6">{forecast.months.map((month) => {
      const income = month.events.filter((event) => event.kind === "income"); const expenses = month.events.filter((event) => event.kind === "expense"); const invoices = month.events.filter((event) => event.kind === "card_invoice");
      return <section key={month.month} className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-semibold capitalize">{month.label}</h2><p className="mt-1 text-sm text-muted-foreground">Saldo inicial <MoneyValue className="font-medium" value={month.startBalance} /></p></div><div className="sm:text-right"><p className="text-xs text-muted-foreground">Saldo projetado</p><MoneyValue className="mt-1 block text-2xl font-bold" tone={month.endBalance < 0 ? "expense" : "income"} value={month.endBalance} /></div></div><dl className="grid grid-cols-2 gap-3 py-5 sm:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Entradas</dt><dd><MoneyValue className="font-semibold" tone="income" value={month.income} /></dd></div><div><dt className="text-xs text-muted-foreground">Contas</dt><dd><MoneyValue className="font-semibold" tone="expense" value={month.expenses} /></dd></div><div><dt className="text-xs text-muted-foreground">Faturas</dt><dd><MoneyValue className="font-semibold" tone="expense" value={month.cardInvoices} /></dd></div><div><dt className="text-xs text-muted-foreground">Estimativas incluídas</dt><dd><MoneyValue className="font-semibold" tone="pending" value={month.estimated} /></dd></div></dl>{month.events.length ? <div className="grid gap-5 lg:grid-cols-3"><EventGroup title="Receitas previstas" events={income} /><EventGroup title="Contas e despesas" events={expenses} /><EventGroup title="Faturas" events={invoices} /></div> : <EmptyState title="Nenhum evento previsto" description="O saldo permanece inalterado neste mês." />}</section>;
    })}</div>
  </main>;
}

export default function ForecastPage() { return <AppShell><Suspense fallback={<FinancePageLoading />}><ForecastContent /></Suspense></AppShell>; }
