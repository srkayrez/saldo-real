import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { PageHeader } from "@/components/finance/finance-ui";
import { TransactionForm } from "@/components/finance/transaction-form";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getActiveAccounts, getCategories, getTransaction } from "@/lib/finance/data";

type Props = { params: Promise<{ id: string }> };

async function EditTransactionContent({ params }: Props) {
  const [workspace, route] = await Promise.all([getActiveWorkspace(), params]);
  if (!workspace) return <main className="mx-auto max-w-4xl p-6">Nenhum workspace disponível.</main>;
  const [transaction, accounts, categories] = await Promise.all([
    getTransaction(workspace.id, route.id), getActiveAccounts(workspace.id), getCategories(workspace.id),
  ]);
  if (!transaction) notFound();
  if (transaction.origin === "card_invoice_payment" || transaction.status !== "pending") {
    return <main className="mx-auto max-w-4xl space-y-4 p-6"><PageHeader title="Movimentação somente leitura" description="Apenas movimentações manuais pendentes podem ser editadas." /><Button asChild><Link href={`/transactions/${route.id}`}>Ver movimentação</Link></Button></main>;
  }
  return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
    <PageHeader action={<Button asChild variant="outline"><Link href={`/transactions/${route.id}`}>Voltar</Link></Button>} description="O status permanece pendente durante a edição." title="Editar movimentação" />
    <TransactionForm accounts={accounts} categories={categories} transaction={transaction} />
  </main>;
}

export default function EditTransactionPage(props: Props) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><EditTransactionContent {...props} /></Suspense></AppShell>;
}
