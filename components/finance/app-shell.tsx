import Link from "next/link";
import { Settings } from "lucide-react";
import { Suspense } from "react";

import { LogoutButton } from "@/components/logout-button";
import {
  MobileNavigation,
  SidebarNavigation,
} from "@/components/finance/app-navigation";
import { WorkspaceSelector } from "@/components/finance/workspace-selector";
import {
  getAccessibleWorkspaces,
  getActiveWorkspace,
} from "@/lib/finance/context";

async function WorkspaceSelectorContent({ selectorId }: { selectorId: string }) {
  const [workspaces, activeWorkspace] = await Promise.all([
    getAccessibleWorkspaces(),
    getActiveWorkspace(),
  ]);

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Nenhum workspace disponível</p>;
  }

  return (
    <WorkspaceSelector
      activeWorkspaceId={activeWorkspace.id}
      selectorId={selectorId}
      workspaces={workspaces}
    />
  );
}

function WorkspaceSelectorLoading() {
  return <div className="h-14 w-full animate-pulse rounded-lg bg-muted" />;
}

function SidebarNavigationLoading() {
  return <div className="h-48 animate-pulse rounded-xl bg-muted" />;
}

function MobileNavigationLoading() {
  return <div className="fixed inset-x-0 bottom-0 z-50 h-16 border-t bg-card md:hidden" />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="border-b px-6 py-6">
          <Link href="/dashboard" className="flex items-center gap-3 text-lg font-bold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              SR
            </span>
            Saldo Real
          </Link>
        </div>
        <div className="border-b p-4">
          <Suspense fallback={<WorkspaceSelectorLoading />}>
            <WorkspaceSelectorContent selectorId="desktop-active-workspace" />
          </Suspense>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <Suspense fallback={<SidebarNavigationLoading />}>
            <SidebarNavigation />
          </Suspense>
        </div>
        <div className="border-t p-4">
          <Link href="/workspaces" className="mb-2 flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="size-4" /> Espaços e membros</Link>
          <LogoutButton />
        </div>
      </aside>

      <div className="min-w-0 md:pl-64">
        <header className="sticky top-0 z-30 border-b bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <Link href="/dashboard" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              SR
            </Link>
            <div className="min-w-0 flex-1">
              <Suspense fallback={<WorkspaceSelectorLoading />}>
                <WorkspaceSelectorContent selectorId="mobile-active-workspace" />
              </Suspense>
            </div>
            <Link href="/workspaces" aria-label="Espaços e membros" className="grid size-10 shrink-0 place-items-center rounded-lg border"><Settings className="size-4" /></Link>
          </div>
        </header>
        <div className="pb-24 md:pb-0">{children}</div>
      </div>

      <Suspense fallback={<MobileNavigationLoading />}>
        <MobileNavigation />
      </Suspense>
    </div>
  );
}

export function FinancePageLoading() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="h-9 w-52 rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-32 rounded-2xl bg-muted" />
        <div className="h-32 rounded-2xl bg-muted" />
        <div className="h-32 rounded-2xl bg-muted" />
        <div className="h-32 rounded-2xl bg-muted" />
      </div>
      <div className="h-64 rounded-2xl bg-muted" />
    </main>
  );
}
