import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/finance/format";
import type { TransactionStatus } from "@/types/finance";

type MoneyTone = "expense" | "income" | "neutral" | "pending";

const moneyToneClasses: Record<MoneyTone, string> = {
  expense: "text-finance-expense",
  income: "text-finance-income",
  neutral: "text-foreground",
  pending: "text-finance-pending",
};

export function MoneyValue({
  className,
  tone = "neutral",
  value,
}: {
  className?: string;
  tone?: MoneyTone;
  value: number | string;
}) {
  return (
    <span className={cn("tabular-nums", moneyToneClasses[tone], className)}>
      {formatCurrency(value)}
    </span>
  );
}

export function StatusBadge({ status }: { status: TransactionStatus | "active" | "inactive" | "open" | "closed" | "cancelled" }) {
  const config = {
    active: { className: "bg-green-50 text-green-700 ring-green-600/20", label: "Ativa" },
    inactive: { className: "bg-slate-100 text-slate-600 ring-slate-500/20", label: "Inativa" },
    open: { className: "bg-blue-50 text-blue-700 ring-blue-600/20", label: "Aberta" },
    closed: { className: "bg-amber-50 text-amber-700 ring-amber-600/20", label: "Fechada" },
    cancelled: { className: "bg-slate-100 text-slate-600 ring-slate-500/20", label: "Cancelada" },
    paid: { className: "bg-green-50 text-green-700 ring-green-600/20", label: "Pago" },
    pending: { className: "bg-amber-50 text-amber-700 ring-amber-600/20", label: "Pendente" },
  }[status];

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", config.className)}>
      {config.label}
    </span>
  );
}

export function PageHeader({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-5" />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function MetricCard({
  description,
  featured = false,
  label,
  tone = "neutral",
  value,
}: {
  description: string;
  featured?: boolean;
  label: string;
  tone?: MoneyTone;
  value: number;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm",
        featured && "border-primary/20 bg-primary text-primary-foreground shadow-md",
      )}
    >
      <p className={cn("text-sm font-medium text-muted-foreground", featured && "text-primary-foreground/75")}>
        {label}
      </p>
      <MoneyValue
        className={cn("mt-2 block text-2xl font-bold tracking-tight", featured && "text-primary-foreground sm:text-3xl")}
        tone={featured ? "neutral" : tone}
        value={value}
      />
      <p className={cn("mt-2 text-xs text-muted-foreground", featured && "text-primary-foreground/70")}>
        {description}
      </p>
    </article>
  );
}
