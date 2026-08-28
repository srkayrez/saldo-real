export function monthlyOccurrenceDate(month: string, dayOfMonth: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
}

export function recurrenceWindowMonths(today: string, size = 4) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length: size }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function buildMonthlyOccurrencePlan(input: {
  dayOfMonth: number;
  endDate: string | null;
  startDate: string;
  today: string;
}) {
  return recurrenceWindowMonths(input.today)
    .map((month) => monthlyOccurrenceDate(month, input.dayOfMonth))
    .filter((date) => date >= input.startDate && (!input.endDate || date <= input.endDate));
}
