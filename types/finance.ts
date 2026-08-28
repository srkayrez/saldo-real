export const ACCOUNT_TYPES = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "cash", label: "Dinheiro" },
  { value: "digital_wallet", label: "Carteira digital" },
  { value: "investment", label: "Investimento" },
  { value: "other", label: "Outro" },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];
export type TransactionType = "income" | "expense";
export type TransactionStatus = "pending" | "paid";

export type ActionState = {
  error?: string;
  success?: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
};

export type Account = {
  id: string;
  workspace_id: string;
  name: string;
  account_type: string;
  initial_balance: number | string;
  active: boolean;
  include_in_balance: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  active: boolean;
};

export type Transaction = {
  id: string;
  description: string;
  amount: number | string;
  transaction_type: TransactionType;
  transaction_date: string;
  status: TransactionStatus;
  notes: string | null;
  account: { name: string } | null;
  category: { name: string } | null;
};

export type DashboardPeriod = {
  endDate: string;
  label: string;
  month: string;
  nextMonth: string;
  previousMonth: string;
  startDate: string;
};

export type MonthlySummary = {
  expenses: number;
  income: number;
  result: number;
};

export type CategoryExpenseSummary = {
  categoryName: string;
  total: number;
};

export type FinancialDashboard = MonthlySummary & {
  categoryExpenses: CategoryExpenseSummary[];
  currentBalance: number;
  pendingExpenses: number;
  recentTransactions: Transaction[];
};
