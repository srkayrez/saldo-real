import Link from "next/link";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { CreditCardForm } from "@/components/finance/credit-card-form";
import { PageHeader } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getActiveAccounts } from "@/lib/finance/data";

async function NewCardContent() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return <main className="mx-auto max-w-4xl p-6">Nenhum workspace disponível.</main>;
  const accounts = await getActiveAccounts(workspace.id);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={<Button asChild variant="outline"><Link href="/cards">Voltar</Link></Button>}
        description={`Cadastre um cartão em ${workspace.name}`}
        title="Novo cartão"
      />
      <CreditCardForm accounts={accounts} />
    </main>
  );
}

export default function NewCardPage() {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><NewCardContent /></Suspense></AppShell>;
}
