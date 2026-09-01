import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { DeactivateRecurrenceButton } from "@/components/finance/deactivate-recurrence-button";
import { MoneyValue, PageHeader, StatusBadge } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { formatDate } from "@/lib/finance/format";
import { getRecurrenceOccurrences, getRecurrenceRule, getRecurringCardOccurrences } from "@/lib/finance/recurrences/data";

type Props = { params: Promise<{ id: string }> };

function monthLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC", year: "numeric" })
    .format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`));
}

async function Content({ params }: Props) {
  const [workspace, route] = await Promise.all([getActiveWorkspace(), params]);
  if (!workspace) return <main className="p-6">Nenhum workspace disponível.</main>;
  const rule = await getRecurrenceRule(workspace.id, route.id);
  if (!rule) notFound();
  const [occurrences, cardOccurrences] = await Promise.all([
    rule.payment_method === "account" ? getRecurrenceOccurrences(workspace.id, route.id) : Promise.resolve([]),
    rule.payment_method === "credit_card" ? getRecurringCardOccurrences(workspace.id, route.id) : Promise.resolve([]),
  ]);
  const canEdit = workspace.role !== "viewer";

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title={rule.name} description={rule.payment_method === "credit_card" ? "A regra gera uma compra independente no cartão a cada mês." : "A regra gera movimentações independentes."} action={<div className="flex gap-2"><Button asChild variant="outline"><Link href="/recurrences">Voltar</Link></Button>{canEdit && rule.active && <Button asChild><Link href={`/recurrences/${rule.id}/edit`}>Editar</Link></Button>}</div>} />
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex justify-between"><MoneyValue className="text-3xl font-bold" tone={rule.transaction_type === "income" ? "income" : "expense"} value={rule.amount} /><StatusBadge status={rule.active ? "active" : "inactive"} /></div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Tipo do valor</dt><dd>{rule.amount_type === "fixed" ? "Fixo" : "Estimado"}</dd></div><div><dt className="text-xs text-muted-foreground">Dia</dt><dd>Todo dia {rule.day_of_month}</dd></div><div><dt className="text-xs text-muted-foreground">Pagamento</dt><dd>{rule.payment_method === "credit_card" ? `Cartão ${rule.credit_card?.name ?? "não disponível"}` : `Conta ${rule.account?.name ?? "não disponível"}`}</dd></div><div><dt className="text-xs text-muted-foreground">Início</dt><dd>{formatDate(rule.start_date)}</dd></div><div><dt className="text-xs text-muted-foreground">Fim</dt><dd>{rule.end_date ? formatDate(rule.end_date) : "Sem data final"}</dd></div><div><dt className="text-xs text-muted-foreground">Categoria</dt><dd>{rule.category?.name ?? "Sem categoria"}</dd></div></dl>
        {canEdit && rule.active && <div className="mt-6 border-t pt-5"><DeactivateRecurrenceButton id={rule.id} /></div>}
      </section>
      <section className="space-y-3">
        <div><h2 className="text-xl font-semibold">Ocorrências materializadas</h2><p className="text-sm text-muted-foreground">Cada mês permanece independente e pode ter seu próprio status.</p></div>
        {rule.payment_method === "account" && (occurrences.length ? <div className="divide-y overflow-hidden rounded-2xl border bg-card">{occurrences.map((item) => <Link href={`/transactions/${item.id}`} key={item.id} className="flex flex-col gap-3 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold capitalize">{monthLabel(item.transaction_date)}</p><p className="mt-1 text-sm text-muted-foreground">{formatDate(item.transaction_date)} · {item.account?.name ?? rule.account?.name ?? "Conta não disponível"}</p></div><div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end"><MoneyValue className="font-semibold" tone={item.transaction_type === "income" ? "income" : "expense"} value={item.amount} /><StatusBadge status={item.status} /></div></Link>)}</div> : <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Nenhuma ocorrência materializada.</p>)}
        {rule.payment_method === "credit_card" && (cardOccurrences.length ? <div className="divide-y overflow-hidden rounded-2xl border bg-card">{cardOccurrences.map((item) => <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold capitalize">{monthLabel(item.recurrence_reference_month)}</p><p className="mt-1 text-sm text-muted-foreground">Compra em {formatDate(item.purchase_date)} · {item.credit_card?.name ?? rule.credit_card?.name ?? "Cartão não disponível"}</p><p className="text-xs text-muted-foreground">Fatura {item.invoice ? monthLabel(item.invoice.reference_month) : "não disponível"}</p></div><div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end"><MoneyValue className="font-semibold" tone="expense" value={item.amount} /><StatusBadge status={item.invoice?.status === "paid" ? "paid" : item.status} /></div></div>)}</div> : <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Nenhuma cobrança materializada.</p>)}
        <p className="text-sm text-muted-foreground">Editar a regra não altera movimentações ou compras já criadas.</p>
      </section>
    </main>
  );
}

export default function Page(props: Props) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><Content {...props} /></Suspense></AppShell>;
}
