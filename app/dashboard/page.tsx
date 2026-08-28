import { Suspense } from "react";
import Link from "next/link";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { DashboardMonthSelector } from "@/components/finance/dashboard-month-selector";
import {
  EmptyState,
  MetricCard,
  MoneyValue,
  PageHeader,
  StatusBadge,
} from "@/components/finance/finance-ui";
import { getActiveWorkspace } from "@/lib/finance/context";
import {
  getFinancialDashboard,
  resolveDashboardPeriod,
} from "@/lib/finance/dashboard";
import { formatDate } from "@/lib/finance/format";

type DashboardSearchParams = Promise<{
  month?: string | string[];
}>;

async function DashboardContent({ searchParams }: { searchParams: DashboardSearchParams }) {
  const [workspace, params] = await Promise.all([
    getActiveWorkspace(),
    searchParams,
  ]);

  if (!workspace) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold">Dashboard financeiro</h1>
        <p className="mt-2 text-muted-foreground">
          Nenhum workspace disponível.
        </p>
      </main>
    );
  }

  const period = resolveDashboardPeriod(params.month);
  const dashboard = await getFinancialDashboard(workspace.id, period);

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={<DashboardMonthSelector period={period} />}
        description={`Visão geral de ${workspace.name}`}
        title="Dashboard financeiro"
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6" aria-label="Indicadores financeiros">
        <div className="sm:col-span-2 xl:col-span-2">
          <MetricCard
          description="Contas incluídas e movimentações pagas"
          featured
          label="Saldo atual"
          tone={dashboard.currentBalance >= 0 ? "income" : "expense"}
          value={dashboard.currentBalance}
          />
        </div>
        <MetricCard
          description={period.label}
          label="Receitas do mês"
          tone="income"
          value={dashboard.income}
        />
        <MetricCard
          description={period.label}
          label="Despesas do mês"
          tone="expense"
          value={dashboard.expenses}
        />
        <MetricCard
          description="Receitas menos despesas do período"
          label="Resultado do mês"
          tone={dashboard.result >= 0 ? "income" : "expense"}
          value={dashboard.result}
        />
        <MetricCard
          description="Todas as despesas ainda não pagas"
          label="Despesas pendentes"
          tone="pending"
          value={dashboard.pendingExpenses}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Últimas movimentações</h2>
            <Link href="/transactions" className="text-sm font-medium hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-4">Descrição</th>
                  <th className="p-4">Data</th>
                  <th className="p-4">Categoria</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Valor</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentTransactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b last:border-0">
                    <td className="p-4 font-medium">{transaction.description}</td>
                    <td className="p-4">{formatDate(transaction.transaction_date)}</td>
                    <td className="p-4">{transaction.category?.name ?? "Sem categoria"}</td>
                    <td className="p-4">
                      {transaction.transaction_type === "income" ? "Receita" : "Despesa"}
                    </td>
                    <td className="p-4 font-semibold">
                      <MoneyValue
                        tone={transaction.transaction_type === "income" ? "income" : "expense"}
                        value={transaction.amount}
                      />
                    </td>
                    <td className="p-4">
                      <StatusBadge status={transaction.status} />
                    </td>
                  </tr>
                ))}
                {dashboard.recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        description="Registre sua primeira receita ou despesa para acompanhar o histórico."
                        title="Nenhuma movimentação"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {dashboard.recentTransactions.map((transaction) => (
              <article key={transaction.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{transaction.description}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {transaction.category?.name ?? "Sem categoria"} · {formatDate(transaction.transaction_date)}
                    </p>
                  </div>
                  <MoneyValue
                    className="shrink-0 font-bold"
                    tone={transaction.transaction_type === "income" ? "income" : "expense"}
                    value={transaction.amount}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {transaction.transaction_type === "income" ? "Receita" : "Despesa"}
                  </span>
                  <StatusBadge status={transaction.status} />
                </div>
              </article>
            ))}
            {dashboard.recentTransactions.length === 0 && (
              <div className="rounded-2xl border bg-card">
                <EmptyState
                  description="Registre sua primeira receita ou despesa para acompanhar o histórico."
                  title="Nenhuma movimentação"
                />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Despesas por categoria</h2>
            <p className="text-sm capitalize text-muted-foreground">{period.label}</p>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <ul className="divide-y">
              {dashboard.categoryExpenses.map((category) => (
                <li key={category.categoryName} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0 truncate text-sm">{category.categoryName}</span>
                  <MoneyValue className="shrink-0 text-sm font-semibold" tone="expense" value={category.total} />
                </li>
              ))}
            </ul>
            {dashboard.categoryExpenses.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma despesa paga neste mês.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  return (
    <AppShell>
      <Suspense fallback={<FinancePageLoading />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}
