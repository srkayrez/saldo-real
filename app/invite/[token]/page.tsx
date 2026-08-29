import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/finance/accept-invite-form";
import { Button } from "@/components/ui/button";
import { getInvitationInfo } from "@/lib/finance/workspaces/data";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ token: string }> };

async function InviteContent({ params }: Props) {
  const { token } = await params;
  const info = await getInvitationInfo(token);
  if (!info) return <main className="mx-auto max-w-lg p-6"><h1 className="text-2xl font-bold">Convite inválido</h1></main>;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const usable = info.status === "pending" && new Date(info.expires_at) > new Date();
  return <main className="mx-auto flex min-h-svh max-w-lg items-center p-6"><section className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm"><div><p className="text-sm text-muted-foreground">Convite para</p><h1 className="text-2xl font-bold">{info.workspace_name}</h1></div><p className="text-sm">Permissão: <strong>{info.role === "editor" ? "Editor" : "Visualizador"}</strong></p><p className="text-sm text-muted-foreground">Este convite está vinculado a {info.invited_email}.</p>{usable ? <AcceptInviteForm token={token} /> : <p className="text-destructive">Este convite expirou ou não está mais disponível.</p>}<Button asChild variant="outline"><Link href="/dashboard">Ir ao dashboard</Link></Button></section></main>;
}

export default function Page(props: Props) {
  return <Suspense fallback={<main className="mx-auto min-h-svh max-w-lg animate-pulse p-6"><div className="h-72 rounded-2xl bg-muted" /></main>}><InviteContent {...props} /></Suspense>;
}
