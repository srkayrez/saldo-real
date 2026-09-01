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
export type TransactionStatus = "pending" | "paid" | "cancelled";

export type ActionState = {
  error?: string;
  inviteUrl?: string;
  success?: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: "editor" | "owner" | "viewer";
  workspace_type: "personal" | "shared";
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
  account_id: string;
  category_id: string | null;
  card_invoice_id: string | null;
  created_at: string;
  id: string;
  description: string;
  amount: number | string;
  transaction_type: TransactionType;
  transaction_date: string;
  paid_date: string | null;
  status: TransactionStatus;
  notes: string | null;
  origin: "manual" | "card_invoice_payment" | "recurrence";
  recurrence_rule_id: string | null;
  recurrence_reference_month: string | null;
  workspace_id: string;
  account: { name: string } | null;
  category: { name: string } | null;
  invoice?: { credit_card_id: string; reference_month: string } | null;
};

export type RecurrenceRule = {
  account: { name: string } | null;
  account_id: string | null;
  active: boolean;
  amount: number | string;
  amount_type: "fixed" | "estimated";
  category: { name: string } | null;
  category_id: string | null;
  credit_card: { name: string } | null;
  credit_card_id: string | null;
  created_at: string;
  day_of_month: number;
  end_date: string | null;
  frequency: "monthly";
  id: string;
  name: string;
  payment_method: "account" | "credit_card";
  start_date: string;
  transaction_type: TransactionType;
  workspace_id: string;
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

export type UpcomingCommitment = {
  amount: number;
  date: string;
  description: string;
  id: string;
  origin: "card_invoice" | "manual";
  overdue: boolean;
  type: "Conta pendente" | "Fatura";
};

export type FutureCardCommitments = {
  after90Days: number;
  days31To60: number;
  days61To90: number;
  next30Days: number;
};

export type FinancialDashboard = MonthlySummary & {
  categoryExpenses: CategoryExpenseSummary[];
  currentBalance: number;
  futureCardCommitments: FutureCardCommitments;
  pendingExpenses: number;
  realBalance: number;
  recentTransactions: Transaction[];
  upcomingCommitments: UpcomingCommitment[];
  upcomingCommitmentsTotal: number;
};
