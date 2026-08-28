export type ForecastEvent = {
  amount: number;
  date: string;
  description: string;
  estimated: boolean;
  id: string;
  kind: "card_invoice" | "expense" | "income";
  origin: "Fatura" | "Manual" | "Recorrente";
};

export type ForecastMonth = {
  cardInvoices: number;
  endBalance: number;
  estimated: number;
  events: ForecastEvent[];
  expenses: number;
  income: number;
  label: string;
  lowestBalance: number;
  month: string;
  startBalance: number;
};

export type FinancialForecast = {
  currentBalance: number;
  finalBalance: number;
  firstNegativeMonth: ForecastMonth | null;
  months: ForecastMonth[];
};
