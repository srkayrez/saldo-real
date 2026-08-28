"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  ACTIVE_WORKSPACE_COOKIE,
  requireWorkspaceMembership,
} from "@/lib/finance/context";

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  await requireWorkspaceMembership(workspaceId);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/transactions/new");
}
