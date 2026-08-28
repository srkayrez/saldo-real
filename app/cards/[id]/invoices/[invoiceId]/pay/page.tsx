import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { InvoicePaymentForm } from "@/components/finance/invoice-payment-form";
import { MoneyValue, PageHeader, StatusBadge } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getCreditCard, getInvoiceForPayment, getTodayInSaoPaulo } from "@/lib/finance/cards/data";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getActiveAccounts } from "@/lib/finance/data";

type Props = { params: Promise<{ id: string; invoiceId: string }> };

async function PaymentContent({ params }: Props) {
  const [workspace, route] = await Promise.all([getActiveWorkspace(), params]);
  if (!workspace) return <main className="mx-auto max-w-4xl p-6">Nenhum workspace disponível.</main>;
  const card = await getCreditCard(workspace.id, route.id);
  if (!card) notFound();
  const [detail, accounts] = await Promise.all([
    getInvoiceForPayment(card, route.invoiceId),
    getActiveAccounts(workspace.id),
  ]);
  if (!detail?.invoice) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={<Button asChild variant="outline"><Link href={`/cards/${card.id}?month=${detail.invoice.reference_month.slice(0, 7)}`}>Voltar</Link></Button>}
        description={`Pagamento integral da fatura de ${card.name}`}
        title="Pagar fatura"
      />

      {detail.effectiveStatus === "closed" && detail.invoiceTotal > 0 ? (
        <InvoicePaymentForm
          accounts={accounts}
          cardId={card.id}
          defaultAccountId={card.payment_account_id}
          invoiceId={detail.invoice.id}
          today={getTodayInSaoPaulo()}
          total={detail.invoiceTotal}
        />
      ) : (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Esta fatura não pode ser paga</h2>
            <StatusBadge status={detail.effectiveStatus} />
          </div>
          <MoneyValue className="mt-4 block text-2xl font-bold" value={detail.invoiceTotal} />
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.effectiveStatus === "paid"
              ? "O pagamento integral desta fatura já foi registrado."
              : detail.invoiceTotal <= 0
                ? "Uma fatura vazia não pode ser paga."
                : "A fatura ainda está aberta e não permite antecipação."}
          </p>
        </div>
      )}
    </main>
  );
}

export default function InvoicePaymentPage(props: Props) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><PaymentContent {...props} /></Suspense></AppShell>;
}
