import Link from "next/link";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { PageHeader } from "@/components/finance/finance-ui";
import { TransactionForm } from "@/components/finance/transaction-form";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getActiveAccounts, getCategories } from "@/lib/finance/data";

async function NewTransactionContent() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return <main className="mx-auto max-w-3xl p-6">Nenhum workspace disponível.</main>;
  const [accounts, categories] = await Promise.all([getActiveAccounts(workspace.id), getCategories(workspace.id)]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={<Button asChild variant="outline" className="w-full sm:w-auto"><Link href="/transactions">Voltar</Link></Button>}
        description={`Registre uma receita ou despesa em ${workspace.name}`}
        title="Nova movimentação"
      />
      <TransactionForm accounts={accounts} categories={categories} />
    </main>
  );
}

export default function NewTransactionPage() {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><NewTransactionContent /></Suspense></AppShell>;
}
