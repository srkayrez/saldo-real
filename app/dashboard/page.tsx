import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

async function DashboardContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold">
          Você precisa estar logado.
        </h1>
      </main>
    );
  }

  const { data: workspaces, error } = await supabase
    .from("workspaces")
    .select(`
      id,
      name,
      type,
      created_at
    `)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold">
          Erro ao carregar os espaços
        </h1>

        <pre className="mt-4">
          {error.message}
        </pre>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">
        Saldo Real
      </h1>

      <p className="mt-2 text-gray-500">
        {user.email}
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">
          Seus espaços
        </h2>

        <div className="mt-4 grid gap-4">
          {workspaces?.map((workspace) => (
            <div
              key={workspace.id}
              className="rounded-xl border p-5"
            >
              <h3 className="font-semibold">
                {workspace.name}
              </h3>

              <p className="text-sm text-gray-500">
                {workspace.type}
              </p>
            </div>
          ))}

          {workspaces?.length === 0 && (
            <p className="text-gray-500">
              Nenhum espaço encontrado.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function DashboardLoading() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="animate-pulse">
        <div className="h-9 w-48 rounded bg-gray-200" />

        <div className="mt-3 h-5 w-64 rounded bg-gray-200" />

        <div className="mt-10 h-6 w-36 rounded bg-gray-200" />

        <div className="mt-5 h-24 rounded-xl bg-gray-200" />
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}