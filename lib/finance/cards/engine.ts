import type {
  CardInvoicePeriod,
  EffectiveInvoiceStatus,
  InstallmentPlanItem,
  InvoiceCycle,
} from "@/types/cards";

function assertDay(day: number, field: string) {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${field} deve estar entre 1 e 31.`);
  }
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Data inválida.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Data inválida.");
  }
  return date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateForDay(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

function getCycleFromClosingDate(
  closingDate: Date,
  closingDay: number,
  dueDay: number,
): InvoiceCycle {
  const normalizedClosing = dateForDay(
    closingDate.getUTCFullYear(),
    closingDate.getUTCMonth(),
    closingDay,
  );
  let dueDate = dateForDay(
    normalizedClosing.getUTCFullYear(),
    normalizedClosing.getUTCMonth(),
    dueDay,
  );

  if (dueDate <= normalizedClosing) {
    dueDate = dateForDay(
      normalizedClosing.getUTCFullYear(),
      normalizedClosing.getUTCMonth() + 1,
      dueDay,
    );
  }

  return {
    closingDate: toIsoDate(normalizedClosing),
    dueDate: toIsoDate(dueDate),
    referenceMonth: `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, "0")}-01`,
  };
}

export function determineInvoiceCycle(
  purchaseDate: string,
  closingDay: number,
  dueDay: number,
): InvoiceCycle {
  assertDay(closingDay, "Dia de fechamento");
  assertDay(dueDay, "Dia de vencimento");
  const purchase = parseDate(purchaseDate);
  let closingDate = dateForDay(
    purchase.getUTCFullYear(),
    purchase.getUTCMonth(),
    closingDay,
  );

  if (purchase > closingDate) {
    closingDate = dateForDay(
      purchase.getUTCFullYear(),
      purchase.getUTCMonth() + 1,
      closingDay,
    );
  }

  return getCycleFromClosingDate(closingDate, closingDay, dueDay);
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function determineCycleForReferenceMonth(
  referenceMonth: string,
  closingDay: number,
  dueDay: number,
): InvoiceCycle {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(referenceMonth)) {
    throw new Error("Mês de referência inválido.");
  }
  assertDay(closingDay, "Dia de fechamento");
  assertDay(dueDay, "Dia de vencimento");
  const [year, month] = referenceMonth.split("-").map(Number);

  for (const offset of [-1, 0]) {
    const closing = dateForDay(year, month - 1 + offset, closingDay);
    const cycle = getCycleFromClosingDate(closing, closingDay, dueDay);
    if (cycle.referenceMonth === `${referenceMonth}-01`) return cycle;
  }

  throw new Error("Não foi possível determinar o ciclo da fatura.");
}

export function resolveInvoicePeriod(
  value: string | string[] | undefined,
  closingDay: number,
  dueDay: number,
  today: string,
): CardInvoicePeriod {
  const candidate = Array.isArray(value) ? value[0] : value;
  const fallback = determineInvoiceCycle(today, closingDay, dueDay).referenceMonth.slice(0, 7);
  const month = candidate && /^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)
    ? candidate
    : fallback;
  const cycle = determineCycleForReferenceMonth(month, closingDay, dueDay);
  const [year, monthNumber] = month.split("-").map(Number);

  return {
    ...cycle,
    label: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1))),
    month,
    nextMonth: shiftMonth(month, 1),
    previousMonth: shiftMonth(month, -1),
  };
}

export function parseMoneyToCents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Informe um valor monetário válido.");
  }
  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new Error("O valor informado é muito alto.");
  }
  return cents;
}

export function distributeInstallmentCents(totalCents: number, count: number) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error("O valor total deve ser maior que zero.");
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("O número de parcelas deve ser pelo menos 1.");
  }
  if (count > totalCents) {
    throw new Error("O número de parcelas não pode superar o total em centavos.");
  }

  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) =>
    base + (index >= count - remainder ? 1 : 0),
  );
}

export function generateInstallmentPlan({
  closingDay,
  dueDay,
  installmentCount,
  purchaseDate,
  totalAmount,
}: {
  closingDay: number;
  dueDay: number;
  installmentCount: number;
  purchaseDate: string;
  totalAmount: string;
}): InstallmentPlanItem[] {
  const firstCycle = determineInvoiceCycle(purchaseDate, closingDay, dueDay);
  const firstClosing = parseDate(firstCycle.closingDate);
  const amounts = distributeInstallmentCents(
    parseMoneyToCents(totalAmount),
    installmentCount,
  );

  return amounts.map((amount, index) => {
    const closingDate = dateForDay(
      firstClosing.getUTCFullYear(),
      firstClosing.getUTCMonth() + index,
      closingDay,
    );
    const cycle = getCycleFromClosingDate(closingDate, closingDay, dueDay);
    return {
      ...cycle,
      amount: `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`,
      installmentNumber: index + 1,
      installmentTotal: installmentCount,
    };
  });
}

export function calculateCommittedLimit(
  installments: { amount: number | string; status: string }[],
) {
  return installments.reduce(
    (total, installment) =>
      installment.status !== "paid" && installment.status !== "cancelled"
        ? total + Number(installment.amount)
        : total,
    0,
  );
}

export function calculateAvailableLimit(limit: number | string, committed: number) {
  return Number(limit) - committed;
}

export function getEffectiveInvoiceStatus(
  invoice: { closing_date: string; status: string } | null,
  today: string,
): EffectiveInvoiceStatus {
  if (invoice?.status === "paid") return "paid";
  if (invoice && invoice.closing_date <= today) return "closed";
  return "open";
}
