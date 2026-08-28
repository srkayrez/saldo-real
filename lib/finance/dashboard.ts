import { createClient } from "@/lib/supabase/server";
import { addDaysToIsoDate, getTodayInSaoPaulo } from "@/lib/finance/date";
import { ensureRecurrenceWindow } from "@/lib/finance/recurrences/data";
import type {
  Account,
  CategoryExpenseSummary,
  DashboardPeriod,
  FinancialDashboard,
  FutureCardCommitments,
  Transaction,
  UpcomingCommitment,
} from "@/types/finance";

type DashboardTransaction = Pick<
  Transaction,
  | "amount"
  | "description"
  | "id"
  | "status"
  | "transaction_date"
  | "transaction_type"
> & {
  category: { name: string } | null;
  origin: "manual" | "card_invoice_payment" | "recurrence";
};

type DashboardCardInstallment = {
  amount: number | string;
  card: { name: string } | null;
  credit_card_id: string;
  id: string;
  invoice: {
    due_date: string;
    id: string;
    reference_month: string;
    status: string;
  } | null;
  purchase: {
    category: { name: string } | null;
    description: string;
  } | null;
  status: string;
};

type CategoryAmount = { amount: number | string; categoryName: string };

function toAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getCurrentMonth() {
  return getTodayInSaoPaulo().slice(0, 7);
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

export function calculateRealBalance(currentBalance: number, commitments: number) {
  return currentBalance - commitments;
}

export function mergeUpcomingCommitments(
  manualTransactions: DashboardTransaction[],
  cardInstallments: DashboardCardInstallment[],
  today: string,
): { items: UpcomingCommitment[]; total: number } {
  const horizon = addDaysToIsoDate(today, 30);
  const manualItems: UpcomingCommitment[] = manualTransactions
    .filter(
      (transaction) =>
        transaction.origin !== "card_invoice_payment" &&
        transaction.transaction_type === "expense" &&
        transaction.status === "pending" &&
        transaction.transaction_date <= horizon,
    )
    .map((transaction) => ({
      amount: toAmount(transaction.amount),
      date: transaction.transaction_date,
      description: transaction.description,
      id: `transaction-${transaction.id}`,
      origin: "manual",
      overdue: transaction.transaction_date < today,
      type: "Conta pendente",
    }));

  const invoiceItems = new Map<string, UpcomingCommitment>();
  for (const installment of cardInstallments) {
    const invoice = installment.invoice;
    if (
      installment.status !== "pending" ||
      !invoice ||
      invoice.status === "paid" ||
      invoice.due_date > horizon
    ) continue;

    const existing = invoiceItems.get(invoice.id);
    if (existing) existing.amount += toAmount(installment.amount);
    else {
      invoiceItems.set(invoice.id, {
        amount: toAmount(installment.amount),
        date: invoice.due_date,
        description: installment.card?.name ?? "Cartão de crédito",
        id: `invoice-${invoice.id}`,
        origin: "card_invoice",
        overdue: invoice.due_date < today,
        type: "Fatura",
      });
    }
  }

  const allItems = [...manualItems, ...invoiceItems.values()].sort(
    (first, second) => first.date.localeCompare(second.date),
  );
  return {
    items: allItems.slice(0, 5),
    total: allItems.reduce((total, item) => total + item.amount, 0),
  };
}

export function calculateFutureCardCommitments(
  installments: DashboardCardInstallment[],
  today: string,
): FutureCardCommitments {
  const day30 = addDaysToIsoDate(today, 30);
  const day60 = addDaysToIsoDate(today, 60);
  const day90 = addDaysToIsoDate(today, 90);
  const totals: FutureCardCommitments = {
    after90Days: 0,
    days31To60: 0,
    days61To90: 0,
    next30Days: 0,
  };

  for (const installment of installments) {
    const invoice = installment.invoice;
    if (installment.status !== "pending" || !invoice || invoice.status === "paid") continue;
    const amount = toAmount(installment.amount);
    if (invoice.due_date <= day30) totals.next30Days += amount;
    else if (invoice.due_date <= day60) totals.days31To60 += amount;
    else if (invoice.due_date <= day90) totals.days61To90 += amount;
    else totals.after90Days += amount;
  }

  return totals;
}

export function calculateCategorySummary(items: CategoryAmount[]): CategoryExpenseSummary[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.categoryName, (totals.get(item.categoryName) ?? 0) + toAmount(item.amount));
  }
  return Array.from(totals, ([categoryName, total]) => ({ categoryName, total }))
    .sort((first, second) => second.total - first.total);
}

export async function getFinancialDashboard(
  workspaceId: string,
  period: DashboardPeriod,
): Promise<FinancialDashboard> {
  await ensureRecurrenceWindow(workspaceId);
  const supabase = await createClient();
  const [accountsResult, transactionsResult, installmentsResult, cardsResult, recentResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("initial_balance, active, include_in_balance")
      .eq("workspace_id", workspaceId),
    supabase
      .from("transactions")
      .select("id, description, amount, transaction_type, transaction_date, paid_date, status, origin, recurrence_rule_id, recurrence_reference_month, category:categories(name)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("card_installments")
      .select(`
        id, amount, status, credit_card_id,
        invoice:card_invoices(id, reference_month, due_date, status),
        purchase:card_purchases(description, category:categories(name))
      `)
      .eq("workspace_id", workspaceId),
    supabase
      .from("credit_cards")
      .select("id, name")
      .eq("workspace_id", workspaceId),
    supabase
      .from("transactions")
      .select(`
        id, workspace_id, account_id, category_id, created_at, description, amount,
        transaction_type, transaction_date, paid_date, status, notes,
        origin, card_invoice_id, recurrence_rule_id, recurrence_reference_month, account:accounts(name), category:categories(name)
      `)
      .eq("workspace_id", workspaceId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const error = accountsResult.error ?? transactionsResult.error ?? installmentsResult.error ?? cardsResult.error ?? recentResult.error;
  if (error) throw new Error(`Não foi possível carregar o dashboard: ${error.message}`);

  const accounts = (accountsResult.data ?? []) as Pick<
    Account,
    "active" | "include_in_balance" | "initial_balance"
  >[];
  const transactions = (transactionsResult.data ?? []) as unknown as DashboardTransaction[];
  const cardsById = new Map(
    (cardsResult.data ?? []).map((card) => [card.id, { name: card.name }]),
  );
  const installments = ((installmentsResult.data ?? []) as unknown as Omit<
    DashboardCardInstallment,
    "card"
  >[]).map((installment) => ({
    ...installment,
    card: cardsById.get(installment.credit_card_id) ?? null,
  }));
  const paidTransactions = transactions.filter((transaction) => transaction.status === "paid");
  const currentBalance = calculateCurrentBalance(accounts, paidTransactions);
  const today = getTodayInSaoPaulo();
  const upcoming = mergeUpcomingCommitments(transactions, installments, today);

  const monthlyIncome = transactions
    .filter(
      (transaction) =>
        transaction.transaction_type === "income" &&
        transaction.status === "paid" &&
        transaction.transaction_date >= period.startDate &&
        transaction.transaction_date < period.endDate,
    )
    .reduce((total, transaction) => total + toAmount(transaction.amount), 0);
  const monthlyManualExpenses = transactions.filter(
    (transaction) =>
      transaction.origin !== "card_invoice_payment" &&
      transaction.transaction_type === "expense" &&
      (transaction.status === "paid" || transaction.status === "pending") &&
      transaction.transaction_date >= period.startDate &&
      transaction.transaction_date < period.endDate,
  );
  const monthlyCardInstallments = installments.filter(
    (installment) =>
      installment.status !== "cancelled" &&
      installment.invoice?.reference_month === `${period.month}-01`,
  );
  const monthlyExpenses =
    monthlyManualExpenses.reduce((total, item) => total + toAmount(item.amount), 0) +
    monthlyCardInstallments.reduce((total, item) => total + toAmount(item.amount), 0);
  const categoryItems: CategoryAmount[] = [
    ...monthlyManualExpenses.map((item) => ({
      amount: item.amount,
      categoryName: item.category?.name ?? "Sem categoria",
    })),
    ...monthlyCardInstallments.map((item) => ({
      amount: item.amount,
      categoryName: item.purchase?.category?.name ?? "Sem categoria",
    })),
  ];

  return {
    categoryExpenses: calculateCategorySummary(categoryItems),
    currentBalance,
    expenses: monthlyExpenses,
    futureCardCommitments: calculateFutureCardCommitments(installments, today),
    income: monthlyIncome,
    pendingExpenses: transactions
      .filter(
        (transaction) =>
          transaction.origin !== "card_invoice_payment" &&
          transaction.transaction_type === "expense" &&
          transaction.status === "pending",
      )
      .reduce((total, transaction) => total + toAmount(transaction.amount), 0),
    realBalance: calculateRealBalance(currentBalance, upcoming.total),
    recentTransactions: (recentResult.data ?? []) as unknown as Transaction[],
    result: monthlyIncome - monthlyExpenses,
    upcomingCommitments: upcoming.items,
    upcomingCommitmentsTotal: upcoming.total,
  };
}
