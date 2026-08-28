import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { DashboardPeriod } from "@/types/finance";

export function DashboardMonthSelector({ period }: { period: DashboardPeriod }) {
  return (
    <div className="flex items-center gap-2" aria-label="Período do dashboard">
      <Button asChild size="icon" variant="outline">
        <Link href={`/dashboard?month=${period.previousMonth}`} aria-label="Mês anterior">
          <ChevronLeft />
        </Link>
      </Button>
      <div className="min-w-40 rounded-md border bg-background px-4 py-2 text-center text-sm font-medium capitalize">
        {period.label}
      </div>
      <Button asChild size="icon" variant="outline">
        <Link href={`/dashboard?month=${period.nextMonth}`} aria-label="Próximo mês">
          <ChevronRight />
        </Link>
      </Button>
    </div>
  );
}
