import type { FinancialForecast, ForecastEvent, ForecastMonth } from "@/types/forecast";

export function forecastMonths(today: string, size = 4) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length: size }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function forecastHorizonEnd(today: string) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month + 3, 1)).toISOString().slice(0, 10);
}

export function normalizeForecastDate(date: string, today: string) {
  return date < today ? today : date;
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC", year: "numeric" })
    .format(new Date(`${month}-01T00:00:00Z`));
}

export function calculateForecast(currentBalance: number, events: ForecastEvent[], today: string): FinancialForecast {
  let balance = Number.isFinite(currentBalance) ? currentBalance : 0;
  const normalized = events.map((event) => ({ ...event, amount: Number.isFinite(event.amount) ? event.amount : 0, date: normalizeForecastDate(event.date, today) }));
  const months: ForecastMonth[] = forecastMonths(today).map((month) => {
    const monthEvents = normalized.filter((event) => event.date.slice(0, 7) === month).sort((a, b) =>
      a.date.localeCompare(b.date) || Number(a.kind === "income") - Number(b.kind === "income"),
    );
    const income = monthEvents.filter((event) => event.kind === "income").reduce((sum, event) => sum + event.amount, 0);
    const expenses = monthEvents.filter((event) => event.kind === "expense").reduce((sum, event) => sum + event.amount, 0);
    const cardInvoices = monthEvents.filter((event) => event.kind === "card_invoice").reduce((sum, event) => sum + event.amount, 0);
    const estimated = monthEvents.filter((event) => event.estimated).reduce((sum, event) => sum + event.amount, 0);
    const startBalance = balance;
    let runningBalance = startBalance;
    let lowestBalance = startBalance;
    for (const event of monthEvents) {
      runningBalance += event.kind === "income" ? event.amount : -event.amount;
      lowestBalance = Math.min(lowestBalance, runningBalance);
    }
    balance = runningBalance;
    return { cardInvoices, endBalance: balance, estimated, events: monthEvents, expenses, income, label: monthLabel(month), lowestBalance, month, startBalance };
  });
  return { currentBalance, finalBalance: balance, firstNegativeMonth: months.find((month) => month.lowestBalance < 0) ?? null, months };
}
