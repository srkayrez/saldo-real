import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { EmptyState, MetricCard, MoneyValue, PageHeader, StatusBadge } from "@/components/finance/finance-ui";
import { InvoiceMonthSelector } from "@/components/finance/invoice-month-selector";
import { Button } from "@/components/ui/button";
import { getCardDetail, getCreditCard, getTodayInSaoPaulo } from "@/lib/finance/cards/data";
import { resolveInvoicePeriod } from "@/lib/finance/cards/engine";
import { getActiveWorkspace } from "@/lib/finance/context";
import { formatDate } from "@/lib/finance/format";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
};

async function CardContent({ params, searchParams }: Props) {
  const [workspace, route, query] = await Promise.all([getActiveWorkspace(), params, searchParams]);
  if (!workspace) return <main className="mx-auto max-w-7xl p-6">Nenhum workspace disponível.</main>;
  const card = await getCreditCard(workspace.id, route.id);
  if (!card) notFound();

  const period = resolveInvoicePeriod(
    query.month,
    card.closing_day,
    card.due_day,
    getTodayInSaoPaulo(),
  );
  const detail = await getCardDetail(card, period.month);
  const canEdit = workspace.role !== "viewer";

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={(
          <div className="flex flex-col gap-2 sm:flex-row">
            {canEdit && detail.invoice && detail.effectiveStatus === "closed" && detail.invoiceTotal > 0 && (
              <Button asChild><Link href={`/cards/${card.id}/invoices/${detail.invoice.id}/pay`}>Pagar fatura</Link></Button>
            )}
            {canEdit && <Button asChild variant="outline"><Link href={`/cards/${card.id}/purchases/new`}><Plus /> Nova compra</Link></Button>}
          </div>
        )}
        description={`Fecha dia ${card.closing_day} · Vence dia ${card.due_day}`}
        title={card.name}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard description={period.label} featured label="Total da fatura" value={detail.invoiceTotal} />
        <MetricCard description="Limite cadastrado" label="Limite total" value={Number(card.limit_amount)} />
        <MetricCard description="Parcelas ainda comprometidas" label="Comprometido" tone="pending" value={detail.committedLimit} />
        <MetricCard description="Limite menos parcelas comprometidas" label="Disponível" tone={detail.availableLimit >= 0 ? "income" : "expense"} value={detail.availableLimit} />
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Fatura</h2>
              {detail.invoice ? <StatusBadge status={detail.effectiveStatus} /> : <span className="text-xs text-muted-foreground">Sem fatura gerada</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Fecha em {formatDate(detail.invoice?.closing_date ?? period.closingDate)} · Vence em {formatDate(detail.invoice?.due_date ?? period.dueDate)}
            </p>
          </div>
          <InvoiceMonthSelector cardId={card.id} period={period} />
        </div>

        {detail.payment && (
          <div className="grid gap-4 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-950 sm:grid-cols-3">
            <div><p className="text-xs text-green-700">Valor pago</p><MoneyValue className="mt-1 block font-bold" tone="income" value={detail.payment.amount} /></div>
            <div><p className="text-xs text-green-700">Data do pagamento</p><p className="mt-1 font-semibold">{formatDate(detail.payment.payment_date)}</p></div>
            <div><p className="text-xs text-green-700">Conta utilizada</p><p className="mt-1 font-semibold">{detail.payment.account?.name ?? "Conta não disponível"}</p></div>
          </div>
        )}

        {detail.invoice && detail.effectiveStatus === "open" && (
          <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Esta fatura ainda está aberta. O pagamento ficará disponível após o fechamento.
          </p>
        )}

        {detail.installments.length > 0 ? (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {detail.installments.map((installment) => (
              <article key={installment.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{installment.purchase?.description ?? "Compra"}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {installment.purchase?.category?.name ?? "Sem categoria"} · Parcela {installment.installment_number}/{installment.installment_total}
                  </p>
                  {installment.purchase?.purchase_date && <p className="mt-1 text-xs text-muted-foreground">Compra em {formatDate(installment.purchase.purchase_date)}</p>}
                </div>
                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <MoneyValue className="text-lg font-bold" tone="expense" value={installment.amount} />
                  <StatusBadge status={installment.status} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border bg-card shadow-sm">
            <EmptyState
              action={canEdit ? <Button asChild><Link href={`/cards/${card.id}/purchases/new`}><Plus /> Nova compra</Link></Button> : undefined}
              description="Não há parcelas vinculadas a esta fatura."
              title="Fatura sem compras"
            />
          </div>
        )}
      </section>
    </main>
  );
}

export default function CardPage(props: Props) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><CardContent {...props} /></Suspense></AppShell>;
}
