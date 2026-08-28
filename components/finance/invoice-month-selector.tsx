import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CardInvoicePeriod } from "@/types/cards";

export function InvoiceMonthSelector({
  cardId,
  period,
}: {
  cardId: string;
  period: CardInvoicePeriod;
}) {
  return (
    <div className="flex items-center gap-2" aria-label="Fatura selecionada">
      <Button asChild size="icon" variant="outline">
        <Link href={`/cards/${cardId}?month=${period.previousMonth}`} aria-label="Fatura anterior"><ChevronLeft /></Link>
      </Button>
      <div className="min-w-40 rounded-lg border bg-card px-4 py-3 text-center text-sm font-semibold capitalize">
        {period.label}
      </div>
      <Button asChild size="icon" variant="outline">
        <Link href={`/cards/${cardId}?month=${period.nextMonth}`} aria-label="Próxima fatura"><ChevronRight /></Link>
      </Button>
    </div>
  );
}
