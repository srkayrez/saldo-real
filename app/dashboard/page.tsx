import { Suspense } from "react";
import Link from "next/link";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { DashboardMonthSelector } from "@/components/finance/dashboard-month-selector";
import { OnboardingChecklist } from "@/components/finance/onboarding-checklist";
import {
  EmptyState,
  MetricCard,
  MoneyValue,
  PageHeader,
  RealBalanceCard,
  StatusBadge,
} from "@/components/finance/finance-ui";
import { getActiveWorkspace } from "@/lib/finance/context";
import {
  getFinancialDashboard,
  resolveDashboardPeriod,
} from "@/lib/finance/dashboard";
import { formatDate } from "@/lib/finance/format";
import { getOnboardingProgress, isOnboardingSkipped } from "@/lib/finance/onboarding";
import { isOnboardingComplete } from "@/types/onboarding";

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
  const [dashboard, onboarding, onboardingSkipped] = await Promise.all([
    getFinancialDashboard(workspace.id, period),
    getOnboardingProgress(workspace.id),
    isOnboardingSkipped(workspace.id),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={<DashboardMonthSelector period={period} />}
        description={`Visão geral de ${workspace.name}`}
        title="Dashboard financeiro"
      />

      {!onboardingSkipped && !isOnboardingComplete(onboarding) && (
        <OnboardingChecklist compact progress={onboarding} />
      )}

      <RealBalanceCard
        committed={dashboard.upcomingCommitmentsTotal}
        currentBalance={dashboard.currentBalance}
        realBalance={dashboard.realBalance}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores financeiros">
        <MetricCard
          description={`Receitas pagas em ${period.label}`}
          label="Receitas do mês"
          tone="income"
          value={dashboard.income}
        />
        <MetricCard
          description="Contas manuais e parcelas do cartão no período"
          label="Despesas do mês"
          tone="expense"
          value={dashboard.expenses}
        />
        <MetricCard
          description="Receitas recebidas menos consumo e compromissos do mês"
          label="Resultado do mês"
          tone={dashboard.result >= 0 ? "income" : "expense"}
          value={dashboard.result}
        />
        <MetricCard
          description="Contas manuais ainda não pagas"
          label="Despesas pendentes"
          tone="pending"
          value={dashboard.pendingExpenses}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Próximos compromissos</h2>
            <p className="text-sm text-muted-foreground">Vencidos e a vencer nos próximos 30 dias</p>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <ul className="divide-y">
              {dashboard.upcomingCommitments.map((commitment) => (
                <li key={commitment.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{commitment.description}</span>
                      {commitment.overdue && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Vencido</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {commitment.type} · {formatDate(commitment.date)}
                    </p>
                  </div>
                  <MoneyValue className="shrink-0 font-semibold" tone="expense" value={commitment.amount} />
                </li>
              ))}
            </ul>
            {dashboard.upcomingCommitments.length === 0 && (
              <EmptyState description="Nenhuma conta ou fatura compromete os próximos 30 dias." title="Tudo livre por enquanto" />
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Parcelas futuras</h2>
            <p className="text-sm text-muted-foreground">Compromissos pendentes de cartão</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            {[
              ["Até 30 dias", dashboard.futureCardCommitments.next30Days],
              ["31 a 60 dias", dashboard.futureCardCommitments.days31To60],
              ["61 a 90 dias", dashboard.futureCardCommitments.days61To90],
              ["Após 90 dias", dashboard.futureCardCommitments.after90Days],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd><MoneyValue className="mt-1 block text-sm font-semibold" tone="pending" value={value} /></dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">Somente a faixa de até 30 dias reduz o Saldo Real.</p>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Últimas movimentações</h2>
            <Link href="/transactions" className="text-sm font-medium hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-sm md:block">
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
                    <td className="p-4">
                      {transaction.origin === "card_invoice_payment"
                        ? "Pagamento de fatura"
                        : transaction.category?.name ?? "Sem categoria"}
                    </td>
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
                      {transaction.origin === "card_invoice_payment"
                        ? "Pagamento de fatura"
                        : transaction.category?.name ?? "Sem categoria"} · {formatDate(transaction.transaction_date)}
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
                Nenhuma despesa ou parcela neste mês.
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
