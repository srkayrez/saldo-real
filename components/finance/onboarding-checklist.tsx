import { Check, Circle, CreditCard, Repeat2, WalletCards } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { OnboardingProgress } from "@/types/onboarding";

const items = [
  { key: "hasAccount", label: "Conta cadastrada", href: "/accounts#nova-conta", icon: WalletCards, optional: false },
  { key: "hasIncome", label: "Renda cadastrada", href: "/transactions/new", icon: Check, optional: false },
  { key: "hasRecurrence", label: "Gasto fixo ou recorrência", href: "/recurrences/new", icon: Repeat2, optional: false },
  { key: "hasCard", label: "Cartão de crédito", href: "/cards/new", icon: CreditCard, optional: true },
] as const;

export function OnboardingChecklist({ compact = false, progress }: { compact?: boolean; progress: OnboardingProgress }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm" aria-labelledby="onboarding-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="onboarding-title" className="text-lg font-semibold">Configure seu Saldo Real</h2>
          <p className="mt-1 text-sm text-muted-foreground">Complete o básico para ter uma visão financeira útil.</p>
        </div>
        {compact && <Button asChild size="sm" variant="outline"><Link href="/onboarding">Continuar</Link></Button>}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const done = progress[item.key];
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={done ? "text-green-600" : "text-muted-foreground"}>{done ? <Check className="size-5" /> : <Circle className="size-5" />}</span>
                <Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{item.label}{item.optional ? " (opcional)" : ""}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
