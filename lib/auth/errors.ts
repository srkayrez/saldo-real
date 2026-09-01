export function getFriendlyAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "Email ou senha incorretos.";
  if (message.includes("email not confirmed")) return "Confirme seu email antes de entrar.";
  if (message.includes("user already registered")) return "Já existe uma conta com este email.";
  if (message.includes("password should be")) return "A senha não atende aos requisitos mínimos de segurança.";
  if (message.includes("rate limit") || message.includes("too many requests")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return fallback;
}
