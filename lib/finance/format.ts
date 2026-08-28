import { ACCOUNT_TYPES } from "@/types/finance";

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function getAccountTypeLabel(value: string) {
  return ACCOUNT_TYPES.find((type) => type.value === value)?.label ?? value;
}
