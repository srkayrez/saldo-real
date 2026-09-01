"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveWorkspace } from "@/lib/finance/context";
import { getOnboardingSkippedCookieName } from "@/lib/finance/onboarding";

export async function skipOnboarding() {
  const workspace = await getActiveWorkspace();
  if (!workspace) redirect("/dashboard");
  (await cookies()).set(getOnboardingSkippedCookieName(workspace.id), "1", {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/dashboard");
}
