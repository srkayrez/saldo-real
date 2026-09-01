import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { MoneyValue, PageHeader, StatusBadge } from "@/components/finance/finance-ui";
import { TransactionActions } from "@/components/finance/transaction-actions";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getTransaction } from "@/lib/finance/data";
import { formatDate } from "@/lib/finance/format";

type Props = { params: Promise<{ id: string }> };

async function TransactionDetailContent({ params }: Props) {
  const [workspace, route] = await Promise.all([getActiveWorkspace(), params]);
  if (!workspace) return <main className="mx-auto max-w-4xl p-6">Nenhum workspace disponível.</main>;
  const transaction = await getTransaction(workspace.id, route.id);
  if (!transaction) notFound();
  const isInvoicePayment = transaction.origin === "card_invoice_payment";
  const canChange = workspace.role !== "viewer" && transaction.origin !== "card_invoice_payment" && transaction.status === "pending";
  const fields = [
    ["Tipo", transaction.transaction_type === "income" ? "Receita" : "Despesa"],
    ["Categoria", transaction.category?.name ?? "Sem categoria"],
    ["Conta", transaction.account?.name ?? "Conta não disponível"],
    ["Data financeira / vencimento", formatDate(transaction.transaction_date)],
    ["Data efetiva do pagamento", transaction.paid_date ? formatDate(transaction.paid_date) : "Não pago"],
    ["Origem", isInvoicePayment ? "Pagamento de fatura" : transaction.origin === "recurrence" ? "Recorrente" : "Movimentação manual"],
  ];

  return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
    <PageHeader action={<Button asChild variant="outline"><Link href="/transactions">Voltar</Link></Button>} description={workspace.name} title={transaction.description} />
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div><p className="text-sm text-muted-foreground">Valor</p><MoneyValue className="mt-1 block text-3xl font-bold" tone={transaction.transaction_type === "income" ? "income" : "expense"} value={transaction.amount} /></div>
        <StatusBadge status={transaction.status} />
      </div>
      <dl className="grid gap-5 py-6 sm:grid-cols-2">
        {fields.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
      </dl>
      <div className="border-t pt-5"><p className="text-xs text-muted-foreground">Observação</p><p className="mt-1 whitespace-pre-wrap text-sm">{transaction.notes ?? "Nenhuma observação."}</p></div>
      {isInvoicePayment && transaction.invoice && <div className="mt-5 rounded-xl bg-muted p-4 text-sm">Esta movimentação foi gerada pelo pagamento de uma fatura. <Link className="font-semibold underline" href={`/cards/${transaction.invoice.credit_card_id}?month=${transaction.invoice.reference_month.slice(0, 7)}`}>Abrir fatura</Link></div>}
    </section>
    {canChange && <TransactionActions transactionId={transaction.id} />}
    {!canChange && <p className="text-sm text-muted-foreground">Movimentações pagas, canceladas ou geradas por fatura são somente leitura.</p>}
  </main>;
}

export default function TransactionDetailPage(props: Props) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><TransactionDetailContent {...props} /></Suspense></AppShell>;
}
