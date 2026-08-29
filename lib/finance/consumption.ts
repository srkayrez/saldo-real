export type ConsumptionTransaction = {
  amount: number | string;
  category: { name: string } | null;
  category_id: string | null;
  origin: "manual" | "card_invoice_payment" | "recurrence";
  status: string;
  transaction_date: string;
  transaction_type: string;
};

export type ConsumptionInstallment = {
  amount: number | string;
  invoice: { reference_month: string } | null;
  purchase: { category: { name: string } | null; category_id: string | null } | null;
  status: string;
};

export type CategoryConsumption = { amount: number; categoryId: string | null; categoryName: string };

function numberValue(value: number | string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export function getMonthlyConsumptionItems(
  transactions: ConsumptionTransaction[],
  installments: ConsumptionInstallment[],
  period: { endDate: string; month: string; startDate: string },
): CategoryConsumption[] {
  const transactionItems = transactions.filter((item) =>
    item.origin !== "card_invoice_payment" && item.transaction_type === "expense" &&
    (item.status === "paid" || item.status === "pending") &&
    item.transaction_date >= period.startDate && item.transaction_date < period.endDate,
  ).map((item) => ({ amount: numberValue(item.amount), categoryId: item.category_id, categoryName: item.category?.name ?? "Sem categoria" }));
  const installmentItems = installments.filter((item) =>
    item.status !== "cancelled" && item.invoice?.reference_month === `${period.month}-01`,
  ).map((item) => ({ amount: numberValue(item.amount), categoryId: item.purchase?.category_id ?? null, categoryName: item.purchase?.category?.name ?? "Sem categoria" }));
  return [...transactionItems, ...installmentItems];
}

export function aggregateConsumptionByCategory(items: CategoryConsumption[]) {
  const totals = new Map<string | null, { categoryName: string; total: number }>();
  for (const item of items) {
    const current = totals.get(item.categoryId);
    totals.set(item.categoryId, { categoryName: item.categoryName, total: (current?.total ?? 0) + item.amount });
  }
  return totals;
}
