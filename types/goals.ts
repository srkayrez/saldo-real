export type GoalStatus = "active" | "cancelled" | "completed";
export type Goal = { created_at: string; id: string; name: string; status: GoalStatus; target_amount: number | string; target_date: string | null; workspace_id: string };
export type GoalContribution = { amount: number | string; contribution_date: string; created_at: string; id: string; notes: string | null };
export type GoalProgress = Goal & { effectiveStatus: GoalStatus; overdue: boolean; percentage: number; remainingAmount: number; requiredMonthly: number | null; savedAmount: number };
export type GoalsSummary = { active: number; completed: number; goals: GoalProgress[]; saved: number; target: number };
