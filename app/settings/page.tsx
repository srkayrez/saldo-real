import { Info, KeyRound, Languages, MonitorCog, Settings2, UserRound, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AccountSettingsForm } from "@/components/finance/account-settings-form";
import { AppShell, FinancePageLoading } from "@/components/finance/app-shell";
import { PageHeader } from "@/components/finance/finance-ui";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function SettingsSection({ children, description, icon: Icon, title }: { children: React.ReactNode; description: string; icon: typeof UserRound; title: string }) {
  return <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"><div className="mb-5 flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span><div><h2 className="font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div></div>{children}</section>;
}

async function SettingsContent() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth/login");
  const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? "");
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Configurações" description="Conta, espaços e preferências do Saldo Real" />
      <SettingsSection icon={UserRound} title="Minha conta" description="Seus dados de acesso e perfil">
        <div className="grid gap-6 md:grid-cols-2">
          <AccountSettingsForm initialName={name} />
          <div className="space-y-4">
            <div><p className="text-sm font-medium">Email</p><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p><p className="mt-1 text-xs text-muted-foreground">A alteração de email exige confirmação pelo provedor e não está disponível nesta versão.</p></div>
            <Button asChild variant="outline"><Link href="/auth/forgot-password"><KeyRound /> Alterar senha</Link></Button>
            <div className="max-w-48"><LogoutButton /></div>
          </div>
        </div>
      </SettingsSection>
      <SettingsSection icon={UsersRound} title="Espaços" description="Gerencie workspaces, membros e permissões">
        <div className="flex flex-col gap-3 sm:flex-row"><Button asChild><Link href="/workspaces"><WalletCards /> Ver espaços</Link></Button><Button asChild variant="outline"><Link href="/settings/workspace"><Settings2 /> Configurar espaço atual</Link></Button></div>
      </SettingsSection>
      <SettingsSection icon={MonitorCog} title="Preferências" description="Ajustes aplicados neste navegador">
        <dl className="divide-y rounded-xl border">
          <div className="flex min-h-14 items-center justify-between gap-4 p-3"><div><dt className="text-sm font-medium">Aparência</dt><dd className="text-xs text-muted-foreground">Claro, escuro ou sistema</dd></div><ThemeSwitcher /></div>
          <div className="flex min-h-14 items-center justify-between gap-4 p-3"><div><dt className="flex items-center gap-2 text-sm font-medium"><Languages className="size-4" /> Idioma</dt><dd className="text-xs text-muted-foreground">Português do Brasil</dd></div><span className="text-sm font-medium">pt-BR</span></div>
          <div className="flex min-h-14 items-center justify-between gap-4 p-3"><div><dt className="text-sm font-medium">Moeda</dt><dd className="text-xs text-muted-foreground">Sem conversão de moedas</dd></div><span className="text-sm font-medium">BRL</span></div>
        </dl>
      </SettingsSection>
      <SettingsSection icon={Info} title="Sobre" description="Saldo Real V1">
        <p className="text-sm leading-6 text-muted-foreground">Organize suas finanças, acompanhe compromissos e descubra quanto do seu dinheiro está realmente disponível.</p>
      </SettingsSection>
    </main>
  );
}

export default function SettingsPage() {
  return <AppShell><Suspense fallback={<FinancePageLoading />}><SettingsContent /></Suspense></AppShell>;
}
