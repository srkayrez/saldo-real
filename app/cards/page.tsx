import { CreditCard, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { EmptyState, MoneyValue, PageHeader, StatusBadge } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getCreditCards } from "@/lib/finance/cards/data";
import { getActiveWorkspace } from "@/lib/finance/context";

function formatReferenceMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC", year: "numeric" })
    .format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`));
}

async function CardsContent() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return <main className="mx-auto max-w-7xl p-6">Nenhum workspace disponível.</main>;
  const cards = await getCreditCards(workspace.id);
  const canEdit = workspace.role !== "viewer";

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={canEdit ? <Button asChild className="w-full sm:w-auto"><Link href="/cards/new"><Plus /> Novo cartão</Link></Button> : undefined}
        description={`Cartões de crédito de ${workspace.name}`}
        title="Cartões"
      />

      {cards.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article key={card.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="bg-primary p-5 text-primary-foreground">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-white/15"><CreditCard /></span>
                  <StatusBadge status={card.active ? "active" : "inactive"} />
                </div>
                <h2 className="mt-8 truncate text-xl font-bold">{card.name}</h2>
                <p className="mt-1 text-sm text-primary-foreground/70">
                  Fecha dia {card.closing_day} · Vence dia {card.due_day}
                </p>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <p className="text-xs capitalize text-muted-foreground">
                    Fatura atual · {formatReferenceMonth(card.currentInvoice.referenceMonth)}
                  </p>
                  <MoneyValue className="mt-1 block text-2xl font-bold" value={card.currentInvoice.total} />
                </div>
                <div className="grid grid-cols-3 gap-3 border-t pt-4">
                  <div><p className="text-xs text-muted-foreground">Limite</p><MoneyValue className="mt-1 block text-sm font-semibold" value={card.limit_amount} /></div>
                  <div><p className="text-xs text-muted-foreground">Comprometido</p><MoneyValue className="mt-1 block text-sm font-semibold" tone="pending" value={card.committedLimit} /></div>
                  <div><p className="text-xs text-muted-foreground">Disponível</p><MoneyValue className="mt-1 block text-sm font-semibold" tone={card.availableLimit >= 0 ? "income" : "expense"} value={card.availableLimit} /></div>
                </div>
                <Button asChild className="w-full" variant="outline"><Link href={`/cards/${card.id}`}>Ver faturas</Link></Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-sm">
          <EmptyState
            action={canEdit ? <Button asChild><Link href="/cards/new"><Plus /> Criar cartão</Link></Button> : undefined}
            description="Cadastre um cartão para organizar compras e faturas."
            title="Nenhum cartão cadastrado"
          />
        </div>
      )}
    </main>
  );
}

export default function CardsPage() {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><CardsContent /></Suspense></AppShell>;
}
