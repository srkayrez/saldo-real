export type OnboardingProgress = {
  hasAccount: boolean;
  hasCard: boolean;
  hasIncome: boolean;
  hasRecurrence: boolean;
};

export function isOnboardingComplete(progress: OnboardingProgress) {
  return progress.hasAccount && progress.hasIncome && progress.hasRecurrence;
}
