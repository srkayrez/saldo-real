export type InvoiceStatus = "open" | "closed" | "paid";
export type EffectiveInvoiceStatus = InvoiceStatus;
export type InstallmentStatus = "pending" | "paid" | "cancelled";

export type CreditCard = {
  active: boolean;
  closing_day: number;
  created_at: string;
  due_day: number;
  id: string;
  limit_amount: number | string;
  name: string;
  payment_account: { name: string } | null;
  payment_account_id: string | null;
  workspace_id: string;
};

export type InvoiceCycle = {
  closingDate: string;
  dueDate: string;
  referenceMonth: string;
};

export type CardInvoicePeriod = InvoiceCycle & {
  label: string;
  month: string;
  nextMonth: string;
  previousMonth: string;
};

export type InstallmentPlanItem = InvoiceCycle & {
  amount: string;
  installmentNumber: number;
  installmentTotal: number;
};

export type CardOverview = CreditCard & {
  availableLimit: number;
  committedLimit: number;
  currentInvoice: {
    referenceMonth: string;
    status: InvoiceStatus | null;
    total: number;
  };
};

export type CardInvoice = {
  closing_date: string;
  due_date: string;
  id: string;
  reference_month: string;
  status: InvoiceStatus;
};

export type CardInvoicePayment = {
  account: { name: string } | null;
  account_id: string;
  amount: number | string;
  id: string;
  payment_date: string;
  transaction_id: string;
};

export type InvoiceInstallment = {
  amount: number | string;
  id: string;
  installment_number: number;
  installment_total: number;
  status: InstallmentStatus;
  purchase: {
    category: { name: string } | null;
    description: string;
    purchase_date: string;
  } | null;
};

export type RecurringCardOccurrence = {
  amount: number | string;
  credit_card: { name: string } | null;
  id: string;
  invoice: { reference_month: string; status: InvoiceStatus } | null;
  purchase_date: string;
  recurrence_reference_month: string;
  status: InstallmentStatus;
};

export type CardDetail = {
  availableLimit: number;
  card: CreditCard;
  committedLimit: number;
  installments: InvoiceInstallment[];
  effectiveStatus: EffectiveInvoiceStatus;
  invoice: CardInvoice | null;
  invoiceCycle: InvoiceCycle;
  invoiceTotal: number;
  payment: CardInvoicePayment | null;
};
