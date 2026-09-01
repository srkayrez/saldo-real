import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6 text-center">
      <div className="max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><WifiOff /></span>
        <h1 className="mt-5 text-2xl font-bold">Você está offline</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Conecte-se à internet para acessar seus dados financeiros. O Saldo Real não salva movimentações nem exibe saldos antigos offline.</p>
      </div>
    </main>
  );
}
