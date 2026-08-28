import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { CardPurchaseForm } from "@/components/finance/card-purchase-form";
import { PageHeader } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getCreditCard } from "@/lib/finance/cards/data";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getCategories } from "@/lib/finance/data";

async function NewPurchaseContent({ params }: { params: Promise<{ id: string }> }) {
  const [workspace, route] = await Promise.all([getActiveWorkspace(), params]);
  if (!workspace) return <main className="mx-auto max-w-4xl p-6">Nenhum workspace disponível.</main>;
  const [card, categories] = await Promise.all([
    getCreditCard(workspace.id, route.id),
    getCategories(workspace.id),
  ]);
  if (!card) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        action={<Button asChild variant="outline"><Link href={`/cards/${card.id}`}>Voltar</Link></Button>}
        description={`A compra será lançada em ${card.name}`}
        title="Nova compra"
      />
      <CardPurchaseForm cardId={card.id} categories={categories} />
    </main>
  );
}

export default function NewCardPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><NewPurchaseContent params={params} /></Suspense></AppShell>;
}
