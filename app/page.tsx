import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";

async function HomeRedirect() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/auth/login");
  return null;
}

export default function HomePage() {
  return (
    <Suspense fallback={<main className="grid min-h-svh place-items-center"><div className="size-10 animate-pulse rounded-xl bg-primary" aria-label="Carregando" /></main>}>
      <HomeRedirect />
    </Suspense>
  );
}
