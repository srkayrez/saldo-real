import Link from "next/link";
import { Suspense } from "react";

import { skipOnboarding } from "@/actions/onboarding";
import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { OnboardingChecklist } from "@/components/finance/onboarding-checklist";
import { PageHeader } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace } from "@/lib/finance/context";
import { getOnboardingProgress } from "@/lib/finance/onboarding";
import { isOnboardingComplete } from "@/types/onboarding";

async function OnboardingContent() {
  const workspace = await getActiveWorkspace();
  if (!workspace) return <main className="p-6">Nenhum workspace disponível.</main>;
  const progress = await getOnboardingProgress(workspace.id);
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Primeiros passos" description={`Prepare ${workspace.name} para começar`} />
      <OnboardingChecklist progress={progress} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {!isOnboardingComplete(progress) && <form action={skipOnboarding}><Button className="w-full sm:w-auto" type="submit" variant="ghost">Pular por enquanto</Button></form>}
        <Button asChild className="w-full sm:w-auto"><Link href="/dashboard">Ir para o dashboard</Link></Button>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><OnboardingContent /></Suspense></AppShell>;
}
