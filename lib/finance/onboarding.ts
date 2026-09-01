import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { OnboardingProgress } from "@/types/onboarding";

const SKIPPED_COOKIE_PREFIX = "onboarding_skipped_";

export function getOnboardingSkippedCookieName(workspaceId: string) {
  return `${SKIPPED_COOKIE_PREFIX}${workspaceId}`;
}

export async function isOnboardingSkipped(workspaceId: string) {
  return (await cookies()).get(getOnboardingSkippedCookieName(workspaceId))?.value === "1";
}

export async function getOnboardingProgress(workspaceId: string): Promise<OnboardingProgress> {
  const supabase = await createClient();
  const [accounts, incomeTransactions, incomeRecurrences, recurrences, cards] = await Promise.all([
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("transaction_type", "income").neq("status", "cancelled"),
    supabase.from("recurrence_rules").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("transaction_type", "income"),
    supabase.from("recurrence_rules").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("credit_cards").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);
  const error = accounts.error ?? incomeTransactions.error ?? incomeRecurrences.error ?? recurrences.error ?? cards.error;
  if (error) throw new Error(`Não foi possível carregar o onboarding: ${error.message}`);

  return {
    hasAccount: (accounts.count ?? 0) > 0,
    hasCard: (cards.count ?? 0) > 0,
    hasIncome: (incomeTransactions.count ?? 0) > 0 || (incomeRecurrences.count ?? 0) > 0,
    hasRecurrence: (recurrences.count ?? 0) > 0,
  };
}
