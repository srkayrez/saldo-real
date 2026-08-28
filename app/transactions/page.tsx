import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import {
  EmptyState,
  MoneyValue,
  PageHeader,
  StatusBadge,
} from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getTransactions } from "@/lib/finance/data";
import { formatDate } from "@/lib/finance/format";

async function TransactionsContent() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return <main className="mx-auto max-w-6xl p-6">Nenhum workspace disponível.</main>;
  const transactions = await getTransactions(workspace.id);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={<Button asChild className="w-full sm:w-auto"><Link href="/transactions/new"><Plus /> Nova movimentação</Link></Button>}
        description={`Histórico financeiro de ${workspace.name}`}
        title="Movimentações"
      />
      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b bg-muted/50"><tr><th className="p-4">Data</th><th className="p-4">Descrição</th><th className="p-4">Categoria</th><th className="p-4">Conta</th><th className="p-4">Tipo</th><th className="p-4">Valor</th><th className="p-4">Status</th></tr></thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="border-b last:border-0">
                <td className="p-4">{formatDate(transaction.transaction_date)}</td>
                <td className="p-4 font-medium">{transaction.description}</td>
                <td className="p-4">{transaction.category?.name ?? "Sem categoria"}</td>
                <td className="p-4">{transaction.account?.name ?? "—"}</td>
                <td className="p-4">{transaction.transaction_type === "income" ? "Receita" : "Despesa"}</td>
                <td className="p-4 font-semibold"><MoneyValue tone={transaction.transaction_type === "income" ? "income" : "expense"} value={transaction.amount} /></td>
                <td className="p-4"><StatusBadge status={transaction.status} /></td>
              </tr>
            ))}
            {transactions.length === 0 && <tr><td colSpan={7}><EmptyState title="Nenhuma movimentação" description="Registre uma receita ou despesa para começar seu histórico." /></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {transactions.map((transaction) => (
          <article key={transaction.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{transaction.description}</h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {transaction.category?.name ?? "Sem categoria"}
                </p>
              </div>
              <MoneyValue
                className="shrink-0 font-bold"
                tone={transaction.transaction_type === "income" ? "income" : "expense"}
                value={transaction.amount}
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
              <span className="text-xs text-muted-foreground">{formatDate(transaction.transaction_date)}</span>
              <StatusBadge status={transaction.status} />
            </div>
          </article>
        ))}
        {transactions.length === 0 && (
          <div className="rounded-2xl border bg-card shadow-sm">
            <EmptyState
              action={<Button asChild><Link href="/transactions/new"><Plus /> Adicionar</Link></Button>}
              title="Nenhuma movimentação"
              description="Registre uma receita ou despesa para começar seu histórico."
            />
          </div>
        )}
      </div>
    </main>
  );
}

export default function TransactionsPage() {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><TransactionsContent /></Suspense></AppShell>;
}
