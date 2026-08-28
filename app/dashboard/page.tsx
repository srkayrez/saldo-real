import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="p-8">
        <h1>Você precisa estar logado.</h1>
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
      <main className="p-8">
        <h1>Erro</h1>

        <pre>{error.message}</pre>
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
        </div>
      </section>
    </main>
  );
}