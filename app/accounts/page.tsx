import { Suspense } from "react";
import { Plus, WalletCards } from "lucide-react";
import Link from "next/link";

import { AccountForm } from "@/components/finance/account-form";
import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import {
  EmptyState,
  MoneyValue,
  PageHeader,
  StatusBadge,
} from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getAccounts } from "@/lib/finance/data";
import { getAccountTypeLabel } from "@/lib/finance/format";

async function AccountsContent() {
  const workspace = await getActiveWorkspace();

  if (!workspace) {
    return <main className="mx-auto max-w-6xl p-6">Nenhum workspace disponível.</main>;
  }

  const accounts = await getAccounts(workspace.id);

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={(
          <Button asChild className="w-full sm:w-auto">
            <Link href="#nova-conta"><Plus /> Nova conta</Link>
          </Button>
        )}
        description={`Organize as contas de ${workspace.name}`}
        title="Contas"
      />
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Suas contas</h2>
            <p className="text-sm text-muted-foreground">Saldos informados no cadastro de cada conta.</p>
          </div>
        </div>
        {accounts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <article key={account.id} className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <WalletCards className="size-5" />
                  </span>
                  <StatusBadge status={account.active ? "active" : "inactive"} />
                </div>
                <h3 className="mt-5 truncate text-lg font-semibold">{account.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{getAccountTypeLabel(account.account_type)}</p>
                <div className="mt-5 border-t pt-4">
                  <p className="text-xs text-muted-foreground">Saldo inicial</p>
                  <MoneyValue className="mt-1 block text-xl font-bold" value={account.initial_balance} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border bg-card shadow-sm">
            <EmptyState
              action={<Button asChild><Link href="#nova-conta"><Plus /> Criar conta</Link></Button>}
              description="Crie uma conta para começar a registrar suas movimentações."
              title="Nenhuma conta cadastrada"
            />
          </div>
        )}
      </section>
      <section id="nova-conta" className="scroll-mt-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Nova conta</h2>
          <p className="text-sm text-muted-foreground">Informe os dados básicos da conta financeira.</p>
        </div>
        <AccountForm />
      </section>
    </main>
  );
}

export default function AccountsPage() {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><AccountsContent /></Suspense></AppShell>;
}
