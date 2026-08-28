import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  CategoryExpenseSummary,
  DashboardPeriod,
  FinancialDashboard,
  MonthlySummary,
  Transaction,
} from "@/types/finance";

type BalanceTransaction = Pick<
  Transaction,
  "amount" | "transaction_date" | "transaction_type"
> & {
  category: { name: string } | null;
};

function toAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getCurrentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function resolveDashboardPeriod(value?: string | string[]): DashboardPeriod {
  const candidate = Array.isArray(value) ? value[0] : value;
  const month = candidate && /^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)
    ? candidate
    : getCurrentMonth();
  const nextMonth = shiftMonth(month, 1);
  const [year, monthNumber] = month.split("-").map(Number);

  return {
    endDate: `${nextMonth}-01`,
    label: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1))),
    month,
    nextMonth,
    previousMonth: shiftMonth(month, -1),
    startDate: `${month}-01`,
  };
}

export function calculateCurrentBalance(
  accounts: Pick<Account, "active" | "include_in_balance" | "initial_balance">[],
  paidTransactions: Pick<Transaction, "amount" | "transaction_type">[],
) {
  const initialBalance = accounts.reduce(
    (total, account) =>
      account.active && account.include_in_balance
        ? total + toAmount(account.initial_balance)
        : total,
    0,
  );

  return paidTransactions.reduce(
    (balance, transaction) =>
      transaction.transaction_type === "income"
        ? balance + toAmount(transaction.amount)
        : balance - toAmount(transaction.amount),
    initialBalance,
  );
}

export function calculateMonthlySummary(
  transactions: Pick<Transaction, "amount" | "transaction_type">[],
): MonthlySummary {
  const totals = transactions.reduce(
    (summary, transaction) => {
      if (transaction.transaction_type === "income") {
        summary.income += toAmount(transaction.amount);
      } else {
        summary.expenses += toAmount(transaction.amount);
      }
      return summary;
    },
    { expenses: 0, income: 0 },
  );

  return { ...totals, result: totals.income - totals.expenses };
}

export function calculateCategorySummary(
  transactions: BalanceTransaction[],
): CategoryExpenseSummary[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.transaction_type !== "expense") continue;
    const categoryName = transaction.category?.name ?? "Sem categoria";
    totals.set(categoryName, (totals.get(categoryName) ?? 0) + toAmount(transaction.amount));
  }

  return Array.from(totals, ([categoryName, total]) => ({ categoryName, total }))
    .sort((first, second) => second.total - first.total);
}

export async function getFinancialDashboard(
  workspaceId: string,
  period: DashboardPeriod,
): Promise<FinancialDashboard> {
  const supabase = await createClient();
  const [accountsResult, paidResult, pendingResult, recentResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("initial_balance, active, include_in_balance")
      .eq("workspace_id", workspaceId),
    supabase
      .from("transactions")
      .select("amount, transaction_type, transaction_date, category:categories(name)")
      .eq("workspace_id", workspaceId)
      .eq("status", "paid"),
    supabase
      .from("transactions")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "expense")
      .eq("status", "pending"),
    supabase
      .from("transactions")
      .select(`
        id, description, amount, transaction_type, transaction_date, status, notes,
        account:accounts(name), category:categories(name)
      `)
      .eq("workspace_id", workspaceId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const error = accountsResult.error ?? paidResult.error ?? pendingResult.error ?? recentResult.error;
  if (error) {
    throw new Error(`Não foi possível carregar o dashboard: ${error.message}`);
  }

  const accounts = (accountsResult.data ?? []) as Pick<
    Account,
    "active" | "include_in_balance" | "initial_balance"
  >[];
  const paidTransactions = (paidResult.data ?? []) as unknown as BalanceTransaction[];
  const monthlyTransactions = paidTransactions.filter(
    (transaction) =>
      transaction.transaction_date >= period.startDate &&
      transaction.transaction_date < period.endDate,
  );
  const monthlySummary = calculateMonthlySummary(monthlyTransactions);

  return {
    ...monthlySummary,
    categoryExpenses: calculateCategorySummary(monthlyTransactions),
    currentBalance: calculateCurrentBalance(accounts, paidTransactions),
    pendingExpenses: (pendingResult.data ?? []).reduce(
      (total, transaction) => total + toAmount(transaction.amount),
      0,
    ),
    recentTransactions: (recentResult.data ?? []) as unknown as Transaction[],
  };
}
