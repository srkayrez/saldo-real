"use client";

import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  CreditCard,
  LayoutDashboard,
  Plus,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Movimentações" },
  { href: "/accounts", icon: WalletCards, label: "Contas" },
  { href: "/cards", icon: CreditCard, label: "Cartões" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNavigation() {
  const pathname = usePathname();

  return (
    <nav className="space-y-7" aria-label="Navegação principal">
      <div className="space-y-1">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div>
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Em breve
        </p>
        <div className="mt-2 space-y-1" aria-label="Funcionalidades futuras">
          <div className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground/60">
            <ChartNoAxesCombined className="size-5" />
            Planejamento
          </div>
        </div>
      </div>
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
      aria-label="Navegação mobile"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {primaryItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label === "Movimentações" ? "Movimentos" : item.label}
            </Link>
          );
        })}
        <Link
          href="/transactions/new"
          aria-current={pathname === "/transactions/new" ? "page" : undefined}
          className={cn(
            "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium",
            pathname === "/transactions/new" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Plus className="size-5" />
          Adicionar
        </Link>
        {primaryItems.slice(2).map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
